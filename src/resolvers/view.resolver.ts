import {
	type FilterQuery,
	type FindOptions,
	type OrderDefinition,
	ref,
} from "@mikro-orm/core";
import { GraphQLError, type GraphQLResolveInfo } from "graphql";
import { Arg, Ctx, ID, Info, Mutation, Query, Resolver } from "type-graphql";
import { Note } from "../entities/note.entity";
import {
	SearchViewsInput,
	View,
	ViewAssociationInput,
	ViewFlat,
	ViewInput,
	ViewInternalIdsInput,
	ViewNote,
	ViewNotesPaginated,
	ViewsPaginated,
} from "../entities/view.entity";
import {
	PaginationInput,
	calcHasMorePages,
} from "../utils/graphql/pagination.graphql";
import type { CommonContext } from "../utils/interfaces/context.interface";
import {
	type GraphQLMappedFields,
	getAllNestedKeys,
	getFieldsFromResolvedInfo,
	getFlattenFields,
} from "../utils/resolvers/utils.resolvers";

@Resolver((_of) => View)
export class ViewResolver {
	@Mutation((_return) => ViewFlat)
	public async saveView(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("data") input: ViewInput,
		@Arg("id", () => ID, { nullable: true }) id?: number,
	): Promise<ViewFlat> {
		let view: View | null = null;

		if (id !== undefined && !Number.isNaN(id) && id > 0) {
			//update operation
			view = await ctx.em.findOneOrFail(View, id);

			view.internalId = input.internalId;
			view.name = input.name;
			view.source.id = input.sourceId;
			view.language.id = input.languageId;
			view.displayOrder = input.displayOrder;
			//forced otherwise flush will re-write the same date of the findOne
			view.updatedAt = new Date();
		} else {
			view = ctx.em.create(View, {
				internalId: input.internalId,
				name: input.name,
				source: input.sourceId,
				language: input.languageId,
				displayOrder: input.displayOrder
			});
		}
		await ctx.em.persistAndFlush(view);

		const viewFlat = new ViewFlat(view);
		return viewFlat;
	}

	@Mutation(() => Boolean)
	async deleteView(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("id", () => ID) id: number,
	): Promise<boolean> {
		const view = await ctx.em.findOne(View, { id: id });

		if (!view) {
			throw new Error("View not found");
		}

		await ctx.em.removeAndFlush(view);
		return true;
	}

	@Query((_return) => ViewsPaginated, {
		description: "Search views with filters, paginated",
	})
	public async searchViews(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("searchInput") input: SearchViewsInput,
		@Arg("paginationInput") paginationInput: PaginationInput,
	): Promise<ViewsPaginated> {
		const where: FilterQuery<View> = {};

		if (input.languageIds) {
			where.language = { id: { $in: input.languageIds } };
		}

		if (input.sourceIds) {
			where.source = { id: { $in: input.sourceIds } };
		}

		const mappedFields: GraphQLMappedFields = getFieldsFromResolvedInfo(info);
		const fieldValues: string[] = getFlattenFields(
			mappedFields.nestedFields.items,
			"",
			"",
		);
		const populatedValues: string[] = getAllNestedKeys(
			mappedFields.nestedFields.items,
			"",
		);

		const orderDefinition: OrderDefinition<View> = {};
		orderDefinition.displayOrder = "ASC";

		const options: FindOptions<View> = {
			fields: fieldValues as never[],
			populate: populatedValues as never[],
			limit: paginationInput.limit,
			offset: paginationInput.offset,
			orderBy: orderDefinition
		};

		const [views, totalCount] = await ctx.em.findAndCount(View, where, options);

		return new ViewsPaginated(
			views,
			totalCount,
			calcHasMorePages(
				totalCount,
				paginationInput.limit,
				paginationInput.offset,
			),
		);
	}

	@Query((_return) => [View], { description: "Get views by internal ids" })
	public async getViewsByInternalIds(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("internalIdsInput") input: ViewInternalIdsInput,
	): Promise<View[]> {
		const mappedFields: GraphQLMappedFields = getFieldsFromResolvedInfo(info);
		const fieldValues: string[] = getFlattenFields(mappedFields, "", "");
		const populatedValues: string[] = getAllNestedKeys(mappedFields, "");

		const orderDefinition: OrderDefinition<View> = {};
		orderDefinition.internalId = "ASC";

		const options: FindOptions<View> = {
			fields: fieldValues as never[],
			populate: populatedValues as never[],
			orderBy: orderDefinition,
		};
		const results = await ctx.em.find(
			View,
			{ internalId: { $in: input.internalIds } },
			options,
		);

		return results;
	}

	@Query((_return) => ViewNotesPaginated, {
		description: "Get view notes paginated by view id",
	})
	public async getViewNotesPaginatedByViewId(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("pagination") paginationInput: PaginationInput,
		@Arg("viewId", () => ID) viewId: number,
	): Promise<ViewNotesPaginated> {
		const where: FilterQuery<ViewNote> = {};
		where.view = { id: viewId };

		const mappedFields: GraphQLMappedFields = getFieldsFromResolvedInfo(info);
		const fieldValues: string[] = getFlattenFields(
			mappedFields.nestedFields.items,
			"",
			"viewNoteId",
		);
		const populatedValues: string[] = getAllNestedKeys(
			mappedFields.nestedFields.items,
			"",
		);

		const orderDefinition: OrderDefinition<ViewNote> = {};
		orderDefinition.displayOrder = "ASC";

		const options: FindOptions<ViewNote> = {
			fields: fieldValues as never[],
			populate: populatedValues as never[],
			orderBy: orderDefinition,
			limit: paginationInput.limit,
			offset: paginationInput.offset,
		};

		const [views, totalCount] = await ctx.em.findAndCount(
			ViewNote,
			where,
			options,
		);

		return new ViewNotesPaginated(
			views,
			totalCount,
			calcHasMorePages(
				totalCount,
				paginationInput.limit,
				paginationInput.offset,
			),
		);
	}

	@Mutation((_return) => Boolean)
	public async associateNotesWithView(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("associations") associations: ViewAssociationInput,
	): Promise<boolean> {
		const viewId = associations.viewId;
		const noteIds = associations.notes.map((note) =>
			Number(note.noteId),
		);

		await ctx.em.begin();

		// Validate the viewId exists
		const view = await ctx.em.findOne(
			View,
			{ id: associations.viewId },
			{ fields: ["id"] as never[] },
		);
		if (!view) {
			await ctx.em.rollback();
			throw new Error(`View with id ${viewId.toString()} does not exist`);
		}

		// Validate all noteIds exist
		const notes = await ctx.em.find(
			Note,
			{ id: { $in: noteIds } },
			{ fields: ["id"] as never[] },
		);
		const foundNoteIds = new Set(notes.map((note) => note.id));
		const missingNoteIds = noteIds.filter(
			(id) => !foundNoteIds.has(id),
		);

		if (missingNoteIds.length > 0) {
			await ctx.em.rollback();
			throw new Error(
				`Notes with ids ${missingNoteIds.join(", ")} do not exist`,
			);
		}

		try {
			// clear out previous notes associated to a view
			const query: FilterQuery<NoInfer<ViewNote>> = {};
			query.view = viewId;
			await ctx.em.nativeDelete(ViewNote, query);

			const viewNotes = associations.notes.map((note) => {
				const viewNote = new ViewNote();
				viewNote.view = ref(View, viewId);
				viewNote.note = ref(Note, note.noteId);
				viewNote.displayOrder = note.displayOrder;
				return viewNote;
			});

			await ctx.em.insertMany(ViewNote, viewNotes);

			await ctx.em.commit();
			return true;
		} catch (error: unknown) {
			await ctx.em.rollback();
			if (error instanceof Error) {
				console.error("Error associating notes to view:", error);
			}
			return false;
		}
	}
}
