import {
	type FilterQuery,
	type FindOptions,
	type QBFilterQuery,
	type QBQueryOrderMap,
	QueryOrder,
	ref,
} from "@mikro-orm/core";
import type { EntityManager, QueryBuilder } from "@mikro-orm/sqlite";
import type { GraphQLResolveInfo } from "graphql";
import { Arg, Ctx, ID, Info, Mutation, Query, Resolver } from "type-graphql";
import {
	Note,
	NoteAssociationInput,
	NoteDeleteIntervalInput,
	NoteFlat,
	NoteInput,
	NoteTag,
	NotesPaginated,
	SearchNotesInput,
} from "../entities/note.entity";
import { Tag } from "../entities/tag.entity";
import { NoteSortField } from "../utils/graphql/enum.graphql";
import {
	PaginationInput,
	calcHasMorePages,
} from "../utils/graphql/pagination.graphql";
import { NoteMultiSortInput } from "../utils/graphql/sorter.graphql";
import type { CommonContext } from "../utils/interfaces/context.interface";
import {
	type GraphQLMappedFields,
	getAllNestedKeys,
	getFieldsFromResolvedInfo,
	getFlattenFields,
} from "../utils/resolvers/utils.resolvers";

@Resolver((_of) => Note)
export class NoteResolver {
	@Mutation((_return) => NoteFlat)
	public async saveNote(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("data") input: NoteInput,
		@Arg("id", () => ID, { nullable: true }) id?: number,
	): Promise<NoteFlat> {
		let note: Note | null = null;

		if (id !== undefined && !Number.isNaN(id) && id > 0) {
			// Update operation
			note = await ctx.em.findOneOrFail(Note, id);

			note.internalId = input.internalId;
			note.title = input.title;
			note.body = input.body;
			note.source.id = input.sourceId;
			note.language.id = input.languageId;
			note.date = input.date;
			//forced otherwise flush will re-write the same date of the findOne
			note.updatedAt = new Date();
		} else {
			note = ctx.em.create(Note, {
				internalId: input.internalId,
				title: input.title,
				body: input.body,
				source: input.sourceId,
				language: input.languageId,
				date: input.date,
			});
		}
		await ctx.em.persistAndFlush(note);

		const noteFlat = new NoteFlat(note);
		return noteFlat;
	}

	@Mutation(() => Boolean)
	async deleteNote(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("id", () => ID) id: number,
	): Promise<boolean> {
		const note = await ctx.em.findOne(Note, { id: id });

		if (!note) {
			throw new Error("Note not found");
		}

		await ctx.em.remove(note).flush();
		return true;
	}

	@Mutation((_return) => Boolean)
	public async associateTagsWithNote(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("associations") associations: NoteAssociationInput,
	): Promise<boolean> {
		const noteId = associations.noteId;
		const tagIds = associations.tags.map((tag) => Number(tag.tagId));

		await ctx.em.begin();

		// Validate the noteId exists
		const note = await ctx.em.findOne(
			Note,
			{ id: associations.noteId },
			{ fields: ["id"] as never[] },
		);
		if (!note) {
			await ctx.em.rollback();
			throw new Error(`Note with id ${noteId.toString()} does not exist`);
		}

		// Validate all tagIds exist
		const tags = await ctx.em.find(
			Tag,
			{ id: { $in: tagIds } },
			{ fields: ["id"] as never[] },
		);
		const foundTagIds = new Set(tags.map((tag) => tag.id));
		const missingTagIds = tagIds.filter((id) => !foundTagIds.has(id));

		if (missingTagIds.length > 0) {
			await ctx.em.rollback();
			throw new Error(`Tags with ids ${missingTagIds.join(", ")} do not exist`);
		}

		try {
			// clear out previous tags associated to an artcile
			const query: FilterQuery<NoInfer<NoteTag>> = {};
			query.note = noteId;
			await ctx.em.nativeDelete(NoteTag, query);

			const noteTags = associations.tags.map((tag) => {
				const noteTag = new NoteTag();
				noteTag.note = ref(Note, noteId);
				noteTag.tag = ref(Tag, tag.tagId);
				return noteTag;
			});
			await ctx.em.insertMany(NoteTag, noteTags);

			await ctx.em.commit();
			return true;
		} catch (error: unknown) {
			await ctx.em.rollback();
			if (error instanceof Error) {
				console.error("Error associating tags to note:", error);
			}
			return false;
		}
	}

	@Query((_return) => NotesPaginated, {
		description: "Search notes with filters, paginated",
	})
	public async searchNotes(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("searchInput") input: SearchNotesInput,
		@Arg("pagination") paginationInput: PaginationInput,
		@Arg("sortInput", () => NoteMultiSortInput, { nullable: true })
		sortInput?: NoteMultiSortInput,
	): Promise<NotesPaginated> {
		// Cast the entity manager to Sqlite EntityManager
		const _em: EntityManager = ctx.em as EntityManager;
		// Get the fields of the resolver request
		const _mappedFields: GraphQLMappedFields = getFieldsFromResolvedInfo(info);

		const _qb: QueryBuilder<Note> = _em.createQueryBuilder(
			Note,
			"note",
		);

		const fields: string[] = [];
		if ("items" in _mappedFields.nestedFields) {
			fields.push(
				...this.extractNoteFields(_mappedFields.nestedFields.items),
			);
		}

		void _qb.select(fields);

		// build all the regular filters - date filters are always populated
		let filters: QBFilterQuery<Note> = {
			date: {
				$gte: input.fromDate,
				$lte: input.toDate,
			},
		};

		if (input.sourceIds !== undefined) {
			filters = {
				...filters,
				source: {
					$in: input.sourceIds,
				},
			};
		}

		if (input.languageIds !== undefined) {
			filters = {
				...filters,
				language: {
					$in: input.languageIds,
				},
			};
		}

		if (input.tagIds !== undefined) {
			filters = {
				...filters,
				tags: {
					tag: {
						id: { $in: input.tagIds },
					},
				},
			};
		}

		if (
			"items" in _mappedFields.nestedFields &&
			"source" in _mappedFields.nestedFields.items.nestedFields
		) {
			void _qb.leftJoinAndSelect("note.source", "source");
		}
		if (
			"items" in _mappedFields.nestedFields &&
			"language" in _mappedFields.nestedFields.items.nestedFields
		) {
			void _qb.leftJoinAndSelect("note.language", "language");
		}
		if (
			"items" in _mappedFields.nestedFields &&
			"tags" in _mappedFields.nestedFields.items.nestedFields
		) {
			void _qb
				.leftJoinAndSelect("note.tags", "note_tag")
				.leftJoinAndSelect("note_tag.tag", "tag");
		}

		const sorters: QBQueryOrderMap<Note>[] = [];

		if (sortInput !== undefined) {
			for (const value of sortInput.sorts) {
				switch (value.field) {
					case NoteSortField.date:
						sorters.push({ date: value.sort });
						break;
					case NoteSortField.languageId:
						sorters.push({ language: { id: value.sort } });
						break;
					case NoteSortField.sourceId:
						sorters.push({ source: { id: value.sort } });
						break;
				}
			}
			void _qb.orderBy(sorters);
		} else {
			// default sorting of query
			sorters.push({ date: QueryOrder.ASC });
			if (
				"items" in _mappedFields.nestedFields &&
				"tags" in _mappedFields.nestedFields.items.nestedFields
			) {
				sorters.push({ tags: { tag: { displayOrder: QueryOrder.ASC } } });
			}
			void _qb.orderBy(sorters);
		}

		// if there is a searchPhrase arg, use knex and calculate the results via ids
		if (input.searchPhrase !== undefined) {
			const results: [number, number[], boolean] =
				await this.fetchNoteIdsBySearchPhrase(
					input.searchPhrase,
					_em,
					filters,
					sorters,
					paginationInput,
				);

			// unwrap the values from results
			const totalCount = results[0];
			const ids = results[1];
			const hasMorePages = results[2];

			// do the real query based on the returned ids
			const notes = await _qb
				.clone()
				.where({
					id: {
						$in: ids,
					},
				})
				.getResult();

			// Create a map of notes by ID for easier lookup
			const noteMap = notes.reduce(
				(map: Record<number, Note>, note) => {
					map[note.id] = note;
					return map;
				},
				{},
			);

			// Sort the fetched notes based on the order of noteIds
			const sortedByIdsArrayNotes = ids.map((id) => noteMap[id]);

			return new NotesPaginated(
				sortedByIdsArrayNotes,
				totalCount,
				hasMorePages,
			);
			// biome-ignore lint/style/noUselessElse: fail gracefully on no input phrase
		} else {
			const results = await _qb
				.clone()
				.where(filters)
				.offset(paginationInput.offset)
				.limit(paginationInput.limit)
				.getResultAndCount();

			const notes = results[0];
			const totalCount = results[1];

			return new NotesPaginated(
				notes,
				totalCount,
				calcHasMorePages(
					totalCount,
					paginationInput.limit,
					paginationInput.offset,
				),
			);
		}
	}

	@Query((_return) => [Note], {
		description: "Get notes by internal ids",
	})
	public async getNotesByInternalIds(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("internalIds", () => [String]) internalIds: [string],
	): Promise<Note[]> {
		// get the fields of the resolver request
		const mappedFields: GraphQLMappedFields = getFieldsFromResolvedInfo(info);
		const fieldValues: string[] = getFlattenFields(mappedFields, "", "");
		const populatedValues: string[] = getAllNestedKeys(mappedFields, "");

		const options: FindOptions<Note> = {
			fields: fieldValues as never[],
			populate: populatedValues as never[],
		};
		const results = await ctx.em.find(
			Note,
			{ internalId: { $in: internalIds } },
			options,
		);

		return results;
	}

	@Mutation((_returns) => Boolean)
	async deleteNotesInInterval(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("interval") interval: NoteDeleteIntervalInput,
	): Promise<boolean> {
		try {
			const _em: EntityManager = ctx.em as EntityManager;
			const query: FilterQuery<NoInfer<Note>> = {};
			if (interval.fromDate) {
				query.date = { $gte: interval.fromDate, $lte: interval.toDate };
			} else {
				query.date = { $gte: new Date(0), $lte: interval.toDate };
			}
			await _em.nativeDelete(Note, query);
			return true;
		} catch (error) {
			console.error("Error deleting notes:", error);
			return false;
		}
	}

	private async fetchNoteIdsBySearchPhrase(
		searchPhrase: string,
		entityManager: EntityManager,
		filters: QBFilterQuery<Note>,
		sorters: QBQueryOrderMap<Note>[],
		pagination: PaginationInput,
	): Promise<[number, number[], boolean]> {
		// build partially the query with all the filters
		const _innerQb: QueryBuilder<Note> = entityManager
			.createQueryBuilder(Note, "note")
			.where(filters)
			.orderBy(sorters);

		// use knex for join the fts table
		// please note that the escape will be done by sqlite so it should be sql-injections safe
		const knex = entityManager.getKnex();

		const knexCountQuery = _innerQb
			.clone()
			.count("note_id", true)
			.getKnexQuery()
			.innerJoin(
				"note_fts5_index as fts_idx",
				"fts_idx.rowid",
				"=",
				"note.note_id",
			)
			.where(
				knex.raw(
					`note_fts5_index MATCH 'title:"${searchPhrase}" * OR body:"${searchPhrase}" * '`,
				),
			);

		const knexSelectQuery = _innerQb
			.clone()
			.select(["note_id"])
			.getKnexQuery()
			.as("note")
			.innerJoin(
				"note_fts5_index as fts_idx",
				"fts_idx.rowid",
				"=",
				"note.note_id",
			)
			.where(
				knex.raw(
					`note_fts5_index MATCH 'title:"${searchPhrase}" * OR body:"${searchPhrase}" * '`,
				),
			)
			.offset(pagination.offset)
			.limit(pagination.limit);

		const _totalCountResult: { count: number }[] = await entityManager
			.getConnection()
			.execute(knexCountQuery);
		const totalCount: number = _totalCountResult[0].count;

		const _idsResult: { note_id: number }[] = await entityManager
			.getConnection()
			.execute(knexSelectQuery);
		const idsList: number[] = _idsResult.map((note) => note.note_id);

		const result: [number, number[], boolean] = [
			totalCount,
			idsList,
			calcHasMorePages(totalCount, pagination.limit, pagination.offset),
		];
		return result;
	}

	private extractNoteFields(_mappedFields: GraphQLMappedFields): string[] {
		const fields = _mappedFields.flatFields.map((field) =>
			field === "noteId" ? "id" : field,
		);

		return fields;
	}
}
