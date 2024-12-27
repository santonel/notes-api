import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ApolloServer } from "@apollo/server";
import {
	type Collection,
	type EntityManager,
	MikroORM,
	ref,
	rel,
} from "@mikro-orm/core";
import { Migrator } from "@mikro-orm/migrations";
import { SqliteDriver } from "@mikro-orm/sqlite";
import { buildSchema } from "type-graphql";
import { Language } from "../../../src/entities/language.entity";
import {
	Note,
	type NoteFlat,
	NoteTag,
	type NotesPaginated,
} from "../../../src/entities/note.entity";
import { Source } from "../../../src/entities/source.entity";
import { Tag } from "../../../src/entities/tag.entity";
import { NoteResolver } from "../../../src/resolvers/note.resolver";
import type { CommonContext } from "../../../src/utils/interfaces/context.interface";
import { generateInsecureRandomID } from "../../../src/utils/service/identity.service";

describe("Note Queries Resolver Integration Test", () => {
	const isTestDbFileEnabled: boolean = process.env.TEST_DB_FILE
		? process.env.TEST_DB_FILE.toLowerCase() === "true"
		: false;
	let orm: MikroORM;
	let em: EntityManager;
	let apolloServer: ApolloServer<CommonContext>;
	let tmpDbFile: string;
	const unlinkAsync = promisify(fs.unlink);

	beforeEach(async () => {
		try {
			if (isTestDbFileEnabled) {
				tmpDbFile = path.join(
					os.tmpdir(),
					`${generateInsecureRandomID()}.db.test.sqlite`,
				);
			} else {
				tmpDbFile = ":memory:";
			}
			const ormTestConfig = {
				dbName: tmpDbFile,
				driver: SqliteDriver,
				extensions: [Migrator],
				entities: ["dist/src/entities/*.entity.js"],
				entitiesTs: ["src/entities/*.entity.ts"],
				//debug: false,
				debug: true,
				logger: (message: string) => {
					console.info(message);
				},
				migrations: {
					path: "dist/src/migrations",
					glob: "*.migration.{js,ts}",
				},
			} satisfies Parameters<typeof MikroORM.init>[0];
			orm = await MikroORM.init(ormTestConfig);
			const migrator = orm.getMigrator();
			await migrator.up();
			const migrations = await migrator.getPendingMigrations();
			if (migrations.length > 0) {
				await migrator.up();
			}
		} catch (error) {
			console.error("Could not connect to the database", error);
			throw error;
		}

		const schema = await buildSchema({
			resolvers: [NoteResolver],
			validate: true,
		});

		apolloServer = new ApolloServer<CommonContext>({
			schema,
		});

		em = orm.em.fork();
	});

	afterEach(async () => {
		await orm.close(true);
		if (isTestDbFileEnabled) {
			await unlinkAsync(tmpDbFile);
		}
	});

	async function dbSetup(): Promise<void> {
		// add sources for test
		const sources: Source[] = [];
		const languages: Language[] = [];
		const tags: Tag[] = [];
		const date = new Date(2003, 1, 14, 20, 0, 0);
		const totalCount = 4;
		for (let i = 1; i <= totalCount; i++) {
			sources.push({
				id: i,
				name: `source_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
			languages.push({
				id: i,
				name: `language_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
			tags.push({
				id: i,
				name: `tag_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
		}

		await em.upsertMany(Source, sources, { onConflictAction: "ignore" });
		await em.upsertMany(Language, languages, { onConflictAction: "ignore" });
		await em.upsertMany(Tag, tags, { onConflictAction: "ignore" });
		await em.flush();
	}

	test("query searchNotes date filters; paginated test", async () => {
		await dbSetup();

		// add notes for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title1");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body1");
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 2, offset: 2 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();
		}
	});

	test("query searchNotes date, source filters;  paginated test", async () => {
		await dbSetup();

		// add notes for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [1],
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(2);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title1");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body1");
			expect(note.source.name).toBeDefined();
			expect(note.source.name).toEqual("source_1");
			expect(note.source.description).toBeDefined();
			expect(note.source.description).toBeNull();
			expect(note.source.displayOrder).toBeDefined();
			expect(note.source.displayOrder).toEqual(1);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [1, 2],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(4);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[1];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id2");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title2");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body2");
			expect(note.source.name).toBeDefined();
			expect(note.source.name).toEqual("source_2");
			expect(note.source.description).toBeDefined();
			expect(note.source.description).toBeNull();
			expect(note.source.displayOrder).toBeDefined();
			expect(note.source.displayOrder).toEqual(2);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [474, 475],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(0);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(0);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();
		}
	});

	test("query searchNotes date, language filters;  paginated test", async () => {
		await dbSetup();

		// add notes for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          language {
            languageId
            name
            description
            displayOrder
            createdAt
            updatedAt            
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				languageIds: [1],
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(2);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title1");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body1");
			expect(note.language.name).toBeDefined();
			expect(note.language.name).toEqual("language_1");
			expect(note.language.description).toBeDefined();
			expect(note.language.description).toBeNull();
			expect(note.language.displayOrder).toBeDefined();
			expect(note.language.displayOrder).toEqual(1);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				languageIds: [1, 2],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(4);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[1];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id2");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title2");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body2");
			expect(note.language.name).toBeDefined();
			expect(note.language.name).toEqual("language_2");
			expect(note.language.description).toBeDefined();
			expect(note.language.description).toBeNull();
			expect(note.language.displayOrder).toBeDefined();
			expect(note.language.displayOrder).toEqual(2);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				languageIds: [474, 475],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(0);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(0);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();
		}
	});

	test("query searchNotes date, tag filters;  paginated test", async () => {
		await dbSetup();

		// add notes and tags for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "title5",
				body: "body5",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
			{ note: ref(Note, 4), tag: ref(Tag, 2) },
			{ note: ref(Note, 5), tag: ref(Tag, 1) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          tags {
            noteTagId
            tag {
              tagId
              name
              description
              displayOrder
              createdAt
              updatedAt
            }
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				tagIds: [1],
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title1");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body1");
			expect(note.tags).toBeDefined();

			const noteTags: Collection<NoteTag> = note.tags;
			expect(noteTags[0].tag).toBeDefined();

			const tag1 = noteTags[0].tag as unknown as Tag;
			expect(tag1.name).toEqual("tag_1");
			expect(tag1.displayOrder).toEqual(1);
			const tag2 = noteTags[1].tag as unknown as Tag;
			expect(tag2.name).toEqual("tag_3");
			expect(tag2.displayOrder).toEqual(3);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				tagIds: [2],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(2);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id3");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title3");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body3");
			expect(note.tags).toBeDefined();

			const noteTags: Collection<NoteTag> | undefined = note.tags;
			expect(noteTags[0].tag).toBeDefined();

			const tag1 = noteTags[0].tag as unknown as Tag;
			expect(tag1.name).toEqual("tag_1");
			expect(tag1.displayOrder).toEqual(1);
			const tag2 = noteTags[1].tag as unknown as Tag;
			expect(tag2.name).toEqual("tag_2");
			expect(tag2.displayOrder).toEqual(2);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				tagIds: [2, 3],
			},
			pagination: { limit: 2, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(3);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("title1");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("body1");
			expect(note.tags).toBeDefined();

			const noteTags: Collection<NoteTag> | undefined = note.tags;
			expect(noteTags[0].tag).toBeDefined();

			const tag1 = noteTags[0].tag as unknown as Tag;
			expect(tag1.name).toEqual("tag_1");
			expect(tag1.displayOrder).toEqual(1);
			const tag2 = noteTags[1].tag as unknown as Tag;
			expect(tag2.name).toEqual("tag_3");
			expect(tag2.displayOrder).toEqual(3);
		}
	});

	test("query searchNotes date, source, language filters;  paginated test", async () => {
		await dbSetup();

		// add notes for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "title5",
				body: "body5",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				internalId: "int_id6",
				title: "title6",
				body: "body6",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				internalId: "int_id7",
				title: "title7",
				body: "body7",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
			{
				internalId: "int_id8",
				title: "title8",
				body: "body8",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 19, 0),
			},
			{
				internalId: "int_id9",
				title: "title9",
				body: "body9",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 20, 0),
			},
			{
				internalId: "int_id10",
				title: "title10",
				body: "body10",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 21, 0),
			},
			{
				internalId: "int_id11",
				title: "title11",
				body: "body11",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 16, 3, 22, 0),
			},
			{
				internalId: "int_id12",
				title: "title12",
				body: "body12",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 16, 3, 23, 0),
			},
			{
				internalId: "int_id13",
				title: "title13",
				body: "body13",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 16, 3, 24, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt            
          }
          language {
            languageId
            name
            description
            displayOrder
            createdAt
            updatedAt  
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [1],
				languageIds: [2],
			},
			pagination: { limit: 4, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(4);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(5);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id1");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("title1");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("body1");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_1");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(1);
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_2");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(2);

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id7");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("title7");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("body7");
			expect(note2.source.name).toBeDefined();
			expect(note2.source.name).toEqual("source_1");
			expect(note2.source.description).toBeDefined();
			expect(note2.source.description).toBeNull();
			expect(note2.source.displayOrder).toBeDefined();
			expect(note2.source.displayOrder).toEqual(1);
			expect(note2.language.name).toBeDefined();
			expect(note2.language.name).toEqual("language_2");
			expect(note2.language.description).toBeDefined();
			expect(note2.language.description).toBeNull();
			expect(note2.language.displayOrder).toBeDefined();
			expect(note2.language.displayOrder).toEqual(2);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [1, 2],
				languageIds: [1, 2],
			},
			pagination: { limit: 20, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(13);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(13);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [453, 454],
				languageIds: [755, 756, 758],
			},
			pagination: { limit: 20, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(0);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(0);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();
		}
	});

	test("query searchNotes date, source, tag filters;  paginated test", async () => {
		await dbSetup();

		// add notes and tags for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "title5",
				body: "body5",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
			{ note: ref(Note, 4), tag: ref(Tag, 2) },
			{ note: ref(Note, 5), tag: ref(Tag, 1) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }          
          tags {
            noteTagId
            tag {
              tagId
              name
              description
              displayOrder
              createdAt
              updatedAt
            }
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [1],
				tagIds: [1],
			},
			pagination: { limit: 4, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 tag 1,3 source 1 [match]
		// id note 2 tag 1   source 2
		// id note 3 tag 1,2 source 1 [match]
		// id note 4 tag 2   source 2
		// id note 5 tag 1   source 1 [match]

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(3);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(3);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			// id note 1 tag 1,3 source 1
			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id1");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("title1");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("body1");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_1");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(1);

			const note1Tags: Collection<NoteTag> | undefined = note1.tags;
			expect(note1Tags[0].tag).toBeDefined();

			const tag11 = note1Tags[0].tag as unknown as Tag;
			expect(tag11.name).toEqual("tag_1");
			expect(tag11.displayOrder).toEqual(1);
			const tag21 = note1Tags[1].tag as unknown as Tag;
			expect(tag21.name).toEqual("tag_3");
			expect(tag21.displayOrder).toEqual(3);

			// id note 3 tag 1,2 source 1
			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id3");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("title3");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("body3");
			expect(note2.source.name).toBeDefined();
			expect(note2.source.name).toEqual("source_1");
			expect(note2.source.description).toBeDefined();
			expect(note2.source.description).toBeNull();
			expect(note2.source.displayOrder).toBeDefined();
			expect(note2.source.displayOrder).toEqual(1);

			const note2Tags: Collection<NoteTag> | undefined = note2.tags;
			expect(note2Tags[0].tag).toBeDefined();

			const tag12 = note1Tags[0].tag as unknown as Tag;
			expect(tag12.name).toEqual("tag_1");
			expect(tag12.displayOrder).toEqual(1);
			const tag22 = note1Tags[1].tag as unknown as Tag;
			expect(tag22.name).toEqual("tag_3");
			expect(tag22.displayOrder).toEqual(3);

			// id note 5 tag 1   source 1
			const note3: Note = responseData.items[2];
			expect(note3.internalId).toBeDefined();
			expect(note3.internalId).toEqual("int_id5");
			expect(note3.title).toBeDefined();
			expect(note3.title).toEqual("title5");
			expect(note3.body).toBeDefined();
			expect(note3.body).toEqual("body5");
			expect(note3.source.name).toBeDefined();
			expect(note3.source.name).toEqual("source_1");
			expect(note3.source.description).toBeDefined();
			expect(note3.source.description).toBeNull();
			expect(note3.source.displayOrder).toBeDefined();
			expect(note3.source.displayOrder).toEqual(1);

			const note3Tags: Collection<NoteTag> | undefined = note3.tags;
			expect(note3Tags[0].tag).toBeDefined();

			const tag31 = note3Tags[0].tag as unknown as Tag;
			expect(tag31.name).toEqual("tag_1");
			expect(tag31.displayOrder).toEqual(1);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [1, 2],
				tagIds: [2, 3],
			},
			pagination: { limit: 4, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 tag 1,3 source 1 [match]
		// id note 2 tag 1   source 2
		// id note 3 tag 1,2 source 1 [match]
		// id note 4 tag 2   source 2 [match]
		// id note 5 tag 1   source 1

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(3);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(3);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			// id note 1 tag 1,3 source 1
			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id1");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("title1");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("body1");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_1");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(1);

			const note1Tags: Collection<NoteTag> | undefined = note1.tags;
			expect(note1Tags[0].tag).toBeDefined();

			const tag11 = note1Tags[0].tag as unknown as Tag;
			expect(tag11.name).toEqual("tag_1");
			expect(tag11.displayOrder).toEqual(1);
			const tag12 = note1Tags[1].tag as unknown as Tag;
			expect(tag12.name).toEqual("tag_3");
			expect(tag12.displayOrder).toEqual(3);

			// id note 3 tag 1,2 source 1
			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id3");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("title3");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("body3");
			expect(note2.source.name).toBeDefined();
			expect(note2.source.name).toEqual("source_1");
			expect(note2.source.description).toBeDefined();
			expect(note2.source.description).toBeNull();
			expect(note2.source.displayOrder).toBeDefined();
			expect(note2.source.displayOrder).toEqual(1);

			const note2Tags: Collection<NoteTag> | undefined = note2.tags;
			expect(note2Tags[0].tag).toBeDefined();

			const tag21 = note2Tags[0].tag as unknown as Tag;
			expect(tag21.name).toEqual("tag_1");
			expect(tag21.displayOrder).toEqual(1);
			const tag22 = note2Tags[1].tag as unknown as Tag;
			expect(tag22.name).toEqual("tag_2");
			expect(tag22.displayOrder).toEqual(2);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				sourceIds: [4, 5],
				tagIds: [1, 2, 3],
			},
			pagination: { limit: 4, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// no matches
		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(0);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(0);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();
		}
	});

	test("query searchNotes date, source, language, tag filters;  paginated test", async () => {
		await dbSetup();

		// add notes and tags for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "title5",
				body: "body5",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
			{ note: ref(Note, 4), tag: ref(Tag, 2) },
			{ note: ref(Note, 5), tag: ref(Tag, 1) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }  
          language {
            languageId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }                    
          tags {
            tag {
              tagId
              name
              description
              displayOrder
              createdAt
              updatedAt
            }
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		const variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				tagIds: [1],
				sourceIds: [1],
				languageIds: [2],
			},
			pagination: { limit: 4, offset: 0 },
		};

		const response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 tag 1,3 source 1 language 1
		// id note 2 tag 1   source 2 language 2
		// id note 3 tag 1,2 source 1 language 2 [match]
		// id note 4 tag 2   source 2 language 1
		// id note 5 tag 1   source 1 language 1

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(1);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(1);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			// id note 3 tag 1,2 source 1
			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id3");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("title3");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("body3");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_1");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(1);
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_2");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(2);

			const note1Tags: Collection<NoteTag> | undefined = note1.tags;
			expect(note1Tags[0].tag).toBeDefined();

			const tag11 = note1Tags[0].tag as unknown as Tag;
			expect(tag11.name).toEqual("tag_1");
			expect(tag11.displayOrder).toEqual(1);
			const tag12 = note1Tags[1].tag as unknown as Tag;
			expect(tag12.name).toEqual("tag_2");
			expect(tag12.displayOrder).toEqual(2);
		}
	});

	test("query searchNotes date, text search filters;  paginated test", async () => {
		// add notes for test
		await dbSetup();
		const notes = [
			{
				internalId: "int_id1",
				title: "banana",
				body: "orange",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "apple",
				body: "strawberry banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "apple",
				body: "various words and a banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "strawberry",
				body: "orange strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "grape",
				body: "dragonfruit",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				internalId: "int_id6",
				title: "banana",
				body: "peach",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				internalId: "int_id7",
				title: "pear",
				body: "kiwi",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "nan",
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("banana");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("orange");
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "nan",
			},
			pagination: { limit: 2, offset: 2 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id3");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("apple");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("various words and a banana");
		}
	});

	test("query searchNotes date, source, text search filters;  paginated test", async () => {
		// add notes for test
		await dbSetup();
		const notes = [
			{
				internalId: "int_id1",
				title: "banana",
				body: "orange",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "apple",
				body: "strawberry banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "apple",
				body: "various words and a banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "strawberry",
				body: "orange strawberry",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "grape",
				body: "dragonfruit",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				internalId: "int_id6",
				title: "banana",
				body: "strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				internalId: "int_id7",
				title: "pear",
				body: "a lot of words and a strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "rawbe",
				sourceIds: [1],
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(3);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id2");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("apple");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("strawberry banana");
			expect(note.source.name).toBeDefined();
			expect(note.source.name).toEqual("source_1");
			expect(note.source.description).toBeDefined();
			expect(note.source.description).toBeNull();
			expect(note.source.displayOrder).toBeDefined();
			expect(note.source.displayOrder).toEqual(1);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "rawbe",
				sourceIds: [1, 2],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(4);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[2];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id6");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("banana");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("strawberry");
			expect(note.source.name).toBeDefined();
			expect(note.source.name).toEqual("source_1");
			expect(note.source.description).toBeDefined();
			expect(note.source.description).toBeNull();
			expect(note.source.displayOrder).toBeDefined();
			expect(note.source.displayOrder).toEqual(1);
		}
	});

	test("query searchNotes date, language, text search filters;  paginated test", async () => {
		await dbSetup();
		const notes = [
			{
				internalId: "int_id1",
				title: "banana",
				body: "orange",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id5",
				title: "grape",
				body: "dragonfruit",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				internalId: "int_id3",
				title: "apple",
				body: "various words and a banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "apple",
				body: "strawberry banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "strawberry",
				body: "orange strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id6",
				title: "banana",
				body: "strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				internalId: "int_id7",
				title: "pear",
				body: "a lot of words and a strawberry",
				source: 1,
				language: 3,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          language {
            languageId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "banana",
				languageIds: [2],
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(3);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("banana");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("orange");
			expect(note.language.name).toBeDefined();
			expect(note.language.name).toEqual("language_2");
			expect(note.language.description).toBeDefined();
			expect(note.language.description).toBeNull();
			expect(note.language.displayOrder).toBeDefined();
			expect(note.language.displayOrder).toEqual(2);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "banana",
				languageIds: [1, 2],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(4);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			let note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id1");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("banana");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("orange");
			expect(note.language.name).toBeDefined();
			expect(note.language.name).toEqual("language_2");
			expect(note.language.description).toBeDefined();
			expect(note.language.description).toBeNull();
			expect(note.language.displayOrder).toBeDefined();
			expect(note.language.displayOrder).toEqual(2);

			note = responseData.items[1];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id2");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("apple");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("strawberry banana");
			expect(note.language.name).toBeDefined();
			expect(note.language.name).toEqual("language_2");
			expect(note.language.description).toBeDefined();
			expect(note.language.description).toBeNull();
			expect(note.language.displayOrder).toBeDefined();
			expect(note.language.displayOrder).toEqual(2);
		}
	});

	test("query searchNotes date, tag, text search filters;  paginated test", async () => {
		await dbSetup();

		// setup notes, better populate the id in this case.
		const notes = [
			{
				id: 1,
				internalId: "int_id1",
				title: "banana kiwi",
				body: "orange",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				id: 5,
				internalId: "int_id5",
				title: "grape",
				body: "strawberry and a lot of words",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "apple",
				body: "various words and a banana and a kiwi",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 2,
				internalId: "int_id2",
				title: "apple kiwi",
				body: "strawberry banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "strawberry",
				body: "orange strawberry kiwi",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				id: 6,
				internalId: "int_id6",
				title: "banana",
				body: "strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				id: 7,
				internalId: "int_id7",
				title: "pear",
				body: "a lot of words and an apple",
				source: 1,
				language: 3,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
			{ note: ref(Note, 4), tag: ref(Tag, 2) },
			{ note: ref(Note, 5), tag: ref(Tag, 1) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          tags {
            noteTagId
            tag {
              tagId
              name
              description
              displayOrder
              createdAt
              updatedAt
            }
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		// id note 1 tag 1,3 banana
		// id note 2 tag 1   banana
		// id note 3 tag 1,2 banana [match]
		// id note 4 tag 2
		// id note 5 tag 1
		// id note 6         banana
		// id note 7

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "banana",
				tagIds: [2],
			},
			pagination: { limit: 10, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(1);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(1);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note: Note = responseData.items[0];
			expect(note.internalId).toBeDefined();
			expect(note.internalId).toEqual("int_id3");
			expect(note.title).toBeDefined();
			expect(note.title).toEqual("apple");
			expect(note.body).toBeDefined();
			expect(note.body).toEqual("various words and a banana and a kiwi");
			expect(note.tags).toBeDefined();

			const noteTags: Collection<NoteTag> | undefined = note.tags;
			expect(noteTags[0].tag).toBeDefined();

			const tag1 = noteTags[0].tag as unknown as Tag;
			expect(tag1.name).toEqual("tag_1");
			expect(tag1.displayOrder).toEqual(1);
			const tag2 = noteTags[1].tag as unknown as Tag;
			expect(tag2.name).toEqual("tag_2");
			expect(tag2.displayOrder).toEqual(2);
		}

		// id note 1 tag 1,3
		// id note 2 tag 1   strawberry [match]
		// id note 3 tag 1,2
		// id note 4 tag 2   strawberry
		// id note 5 tag 1   strawberry [match]
		// id note 6         strawberry
		// id note 7

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "strawberry",
				tagIds: [1],
			},
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(2);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id2");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("apple kiwi");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("strawberry banana");
			expect(note1.tags).toBeDefined();

			const noteTags: Collection<NoteTag> | undefined = note1.tags;
			expect(noteTags[0].tag).toBeDefined();

			const tag1 = noteTags[0].tag as unknown as Tag;
			expect(tag1.name).toEqual("tag_1");
			expect(tag1.displayOrder).toEqual(1);

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id5");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("grape");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("strawberry and a lot of words");
			expect(note2.tags).toBeDefined();

			const note2Tags: Collection<NoteTag> | undefined = note2.tags;
			expect(note2Tags[0].tag).toBeDefined();

			const tag11 = note2Tags[0].tag as unknown as Tag;
			expect(tag11.name).toEqual("tag_1");
			expect(tag11.displayOrder).toEqual(1);
		}

		// id note 1 tag 1,3 kiwi [match]
		// id note 2 tag 1   kiwi [match]
		// id note 3 tag 1,2 kiwi [match]
		// id note 4 tag 2   kiwi [match]
		// id note 5 tag 1
		// id note 6
		// id note 7

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "kiwi",
				tagIds: [1, 2],
			},
			pagination: { limit: 2, offset: 1 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id2");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("apple kiwi");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("strawberry banana");
			expect(note1.tags).toBeDefined();

			const note1Tags: Collection<NoteTag> | undefined = note1.tags;
			expect(note1Tags[0].tag).toBeDefined();

			const tag = note1Tags[0].tag as unknown as Tag;
			expect(tag.name).toEqual("tag_1");

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id3");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("apple");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("various words and a banana and a kiwi");
			expect(note2.tags).toBeDefined();

			const note2Tags: Collection<NoteTag> | undefined = note2.tags;
			expect(note2Tags[0].tag).toBeDefined();

			const tag21 = note2Tags[0].tag as unknown as Tag;
			expect(tag21.name).toEqual("tag_1");
			expect(tag21.displayOrder).toEqual(1);

			const tag22 = note2Tags[1].tag as unknown as Tag;
			expect(tag22.name).toEqual("tag_2");
			expect(tag22.displayOrder).toEqual(2);
		}
	});

	test("query searchNotes date, source, language, text search filters;  paginated test", async () => {
		// add notes for test
		await dbSetup();
		const notes = [
			{
				id: 1,
				internalId: "int_id1",
				title: "banana kiwi",
				body: "orange",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				id: 5,
				internalId: "int_id5",
				title: "grape",
				body: "strawberry and a lot of words",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "apple",
				body: "various words and a banana and a kiwi",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 2,
				internalId: "int_id2",
				title: "apple kiwi",
				body: "strawberry banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "strawberry",
				body: "orange strawberry kiwi",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				id: 6,
				internalId: "int_id6",
				title: "banana",
				body: "strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				id: 7,
				internalId: "int_id7",
				title: "pear",
				body: "a lot of words and an apple",
				source: 1,
				language: 3,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
			{ note: ref(Note, 4), tag: ref(Tag, 2) },
			{ note: ref(Note, 5), tag: ref(Tag, 1) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
      searchNotes(pagination: $pagination, searchInput: $searchInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }
          language {
            languageId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }
        }
        totalCount
        hasNextPage
      }
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "strawberry",
				sourceIds: [1],
				languageIds: [1],
			},
			pagination: { limit: 2, offset: 0 },
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 source 1 language 2 tag 1,3 banana kiwi : orange
		// id note 2 source 1 language 2 tag 1   apple kiwi : strawberry banana
		// id note 3 source 1 language 2 tag 1,2 apple : various words and a banana and a kiwi
		// id note 4 source 1 language 1 tag 2   strawberry : orange strawberry kiwi            [match]
		// id note 5 source 2 language 1 tag 1   grape : strawberry and a lot of words
		// id note 6 source 1 language 1         banana : strawberry                            [match]
		// id note 7 source 1 language 3         pear : a lot of words and an apple

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(2);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id4");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("strawberry");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("orange strawberry kiwi");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_1");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(1);
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_1");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(1);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "grape",
				sourceIds: [2],
				languageIds: [1, 2],
			},
			pagination: { limit: 2, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 source 1 language 2 tag 1,3 banana kiwi : orange
		// id note 2 source 1 language 2 tag 1   apple kiwi : strawberry banana
		// id note 3 source 1 language 2 tag 1,2 apple : various words and a banana and a kiwi
		// id note 4 source 1 language 1 tag 2   strawberry : orange strawberry kiwi
		// id note 5 source 2 language 1 tag 1   grape : strawberry and a lot of words           [match]
		// id note 6 source 1 language 1         banana : strawberry
		// id note 7 source 1 language 3         pear : a lot of words and an apple
		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(1);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(1);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id5");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("grape");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("strawberry and a lot of words");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_2");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(2);
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_1");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(1);
		}
	});

	test("query searchNotes date, source, language, tag, text search filters;  paginated test", async () => {
		// add notes for test
		await dbSetup();
		const notes = [
			{
				id: 1,
				internalId: "int_id1",
				title: "banana kiwi",
				body: "orange",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				id: 5,
				internalId: "int_id5",
				title: "grape",
				body: "strawberry and a lot of words",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "apple",
				body: "various words and a banana and a kiwi",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 2,
				internalId: "int_id2",
				title: "apple kiwi",
				body: "strawberry banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "strawberry",
				body: "orange strawberry kiwi",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				id: 6,
				internalId: "int_id6",
				title: "banana",
				body: "strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				id: 7,
				internalId: "int_id7",
				title: "pear",
				body: "a lot of words and an apple",
				source: 1,
				language: 3,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
			{ note: ref(Note, 4), tag: ref(Tag, 2) },
			{ note: ref(Note, 5), tag: ref(Tag, 1) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!) {
        searchNotes(pagination: $pagination, searchInput: $searchInput) {
          items {
            noteId
            internalId
            title
            body
            date
            createdAt
            updatedAt
            source {
              sourceId
              name
              description
              displayOrder
              createdAt
              updatedAt
            }
            language {
              languageId
              name
              description
              displayOrder
              createdAt
              updatedAt
            }
            tags {
              noteTagId
              tag {
                tagId
                name
                description
                displayOrder
                createdAt
                updatedAt
              }
            }
          }
          totalCount
          hasNextPage
        }
      }`;

		const variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "strawberry",
				sourceIds: [1],
				languageIds: [1, 2],
				tagIds: [1, 2],
			},
			pagination: { limit: 2, offset: 0 },
		};

		const response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 source 1 language 2 tag 1,3 banana kiwi : orange
		// id note 2 source 1 language 2 tag 1   apple kiwi : strawberry banana                 [match]
		// id note 3 source 1 language 2 tag 1,2 apple : various words and a banana and a kiwi
		// id note 4 source 1 language 1 tag 2   strawberry : orange strawberry kiwi            [match]
		// id note 5 source 2 language 1 tag 1   grape : strawberry and a lot of words
		// id note 6 source 1 language 1         banana : strawberry
		// id note 7 source 1 language 3         pear : a lot of words and an apple

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(2);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id2");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("apple kiwi");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("strawberry banana");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_1");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(1);
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_2");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(2);

			const note1Tags: Collection<NoteTag> | undefined = note1.tags;
			expect(note1Tags[0].tag).toBeDefined();

			const tag11 = note1Tags[0].tag as unknown as Tag;
			expect(tag11.name).toEqual("tag_1");
			expect(tag11.displayOrder).toEqual(1);

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id4");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("strawberry");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("orange strawberry kiwi");
			expect(note2.source.name).toBeDefined();
			expect(note2.source.name).toEqual("source_1");
			expect(note2.source.description).toBeDefined();
			expect(note2.source.description).toBeNull();
			expect(note2.source.displayOrder).toBeDefined();
			expect(note2.source.displayOrder).toEqual(1);
			expect(note2.language.name).toBeDefined();
			expect(note2.language.name).toEqual("language_1");
			expect(note2.language.description).toBeDefined();
			expect(note2.language.description).toBeNull();
			expect(note2.language.displayOrder).toBeDefined();
			expect(note2.language.displayOrder).toEqual(1);

			const note2Tags: Collection<NoteTag> | undefined = note2.tags;
			expect(note2Tags[0].tag).toBeDefined();

			const tag21 = note2Tags[0].tag as unknown as Tag;
			expect(tag21.name).toEqual("tag_2");
			expect(tag21.displayOrder).toEqual(2);
		}
	});

	test("query searchNotes date filters; sorted, paginated test", async () => {
		await dbSetup();

		// add notes for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "title5",
				body: "body5",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!, $sortInput: NoteMultiSortInput) {
      searchNotes(pagination: $pagination, searchInput: $searchInput, sortInput: $sortInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
        }
        totalCount
        hasNextPage
      },
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 2, offset: 0 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
				],
			},
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(5);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id5");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-16T03:16:00.000Z");

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id4");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-16T03:15:00.000Z");
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 2, offset: 2 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
				],
			},
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(5);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id3");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-15T11:00:00.000Z");

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id2");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-15T06:00:00.000Z");
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 2, offset: 4 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
				],
			},
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(1);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(5);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id1");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-14T21:00:00.000Z");
		}
	});

	test("query searchNotes date filters, source, language; multi-sorted, paginated test", async () => {
		await dbSetup();

		// add notes for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!, $sortInput: NoteMultiSortInput) {
      searchNotes(pagination: $pagination, searchInput: $searchInput, sortInput: $sortInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          language {
            languageId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }      
        }
        totalCount
        hasNextPage
      },
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 5, offset: 0 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
					{
						field: "languageId",
						sort: "desc",
					},
				],
			},
		};

		// id note 1 source 1 language 2 2003-02-14T21:00:00.000Z
		// id note 2 source 1 language 1 2003-02-14T21:00:00.000Z
		// id note 3 source 2 language 2 2003-02-14T21:00:00.000Z
		// id note 4 source 2 language 1 2003-02-14T21:00:00.000Z

		// should be sorted to:

		// id note 1 source 1 language 2 2003-02-14T21:00:00.000Z
		// id note 3 source 2 language 2 2003-02-14T21:00:00.000Z
		// id note 2 source 1 language 1 2003-02-14T21:00:00.000Z
		// id note 4 source 2 language 1 2003-02-14T21:00:00.000Z

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(4);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id1");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_2");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(2);

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id3");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note2.language.name).toBeDefined();
			expect(note2.language.name).toEqual("language_2");
			expect(note2.language.description).toBeDefined();
			expect(note2.language.description).toBeNull();
			expect(note2.language.displayOrder).toBeDefined();
			expect(note2.language.displayOrder).toEqual(2);

			const note3: Note = responseData.items[2];
			expect(note3.internalId).toBeDefined();
			expect(note3.internalId).toEqual("int_id2");
			expect(note3.date).toBeDefined();
			expect(note3.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note3.language.name).toBeDefined();
			expect(note3.language.name).toEqual("language_1");
			expect(note3.language.description).toBeDefined();
			expect(note3.language.description).toBeNull();
			expect(note3.language.displayOrder).toBeDefined();
			expect(note3.language.displayOrder).toEqual(1);

			const note4: Note = responseData.items[3];
			expect(note4.internalId).toBeDefined();
			expect(note4.internalId).toEqual("int_id4");
			expect(note4.date).toBeDefined();
			expect(note4.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note4.language.name).toBeDefined();
			expect(note4.language.name).toEqual("language_1");
			expect(note4.language.description).toBeDefined();
			expect(note4.language.description).toBeNull();
			expect(note4.language.displayOrder).toBeDefined();
			expect(note4.language.displayOrder).toEqual(1);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 5, offset: 0 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
					{
						field: "sourceId",
						sort: "desc",
					},
				],
			},
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 source 1 language 2 2003-02-14T21:00:00.000Z
		// id note 2 source 1 language 1 2003-02-14T21:00:00.000Z
		// id note 3 source 2 language 2 2003-02-14T21:00:00.000Z
		// id note 4 source 2 language 1 2003-02-14T21:00:00.000Z

		// should be sorted to:

		// id note 3 source 2 language 2 2003-02-14T21:00:00.000Z
		// id note 4 source 2 language 1 2003-02-14T21:00:00.000Z
		// id note 1 source 1 language 2 2003-02-14T21:00:00.000Z
		// id note 2 source 1 language 1 2003-02-14T21:00:00.000Z

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(4);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id3");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_2");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(2);

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id4");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note2.source.name).toBeDefined();
			expect(note2.source.name).toEqual("source_2");
			expect(note2.source.description).toBeDefined();
			expect(note2.source.description).toBeNull();
			expect(note2.source.displayOrder).toBeDefined();
			expect(note2.source.displayOrder).toEqual(2);

			const note3: Note = responseData.items[2];
			expect(note3.internalId).toBeDefined();
			expect(note3.internalId).toEqual("int_id1");
			expect(note3.date).toBeDefined();
			expect(note3.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note3.source.name).toBeDefined();
			expect(note3.source.name).toEqual("source_1");
			expect(note3.source.description).toBeDefined();
			expect(note3.source.description).toBeNull();
			expect(note3.source.displayOrder).toBeDefined();
			expect(note3.source.displayOrder).toEqual(1);

			const note4: Note = responseData.items[3];
			expect(note4.internalId).toBeDefined();
			expect(note4.internalId).toEqual("int_id2");
			expect(note4.date).toBeDefined();
			expect(note4.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note4.source.name).toBeDefined();
			expect(note4.source.name).toEqual("source_1");
			expect(note4.source.description).toBeDefined();
			expect(note4.source.description).toBeNull();
			expect(note4.source.displayOrder).toBeDefined();
			expect(note4.source.displayOrder).toEqual(1);
		}
	});

	test("query searchNotes date filters, source, language, tags; multi-sorted, paginated test", async () => {
		await dbSetup();

		// add notes for test
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				internalId: "int_id5",
				title: "title5",
				body: "body5",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
			{ note: ref(Note, 4), tag: ref(Tag, 2) },
			{ note: ref(Note, 5), tag: ref(Tag, 1) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!, $sortInput: NoteMultiSortInput) {
      searchNotes(pagination: $pagination, searchInput: $searchInput, sortInput: $sortInput) {
        items {
          noteId
          internalId
          title
          body
          date
          createdAt
          updatedAt
          language {
            languageId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }
          source {
            sourceId
            name
            description
            displayOrder
            createdAt
            updatedAt
          }          
          tags {
            noteTagId
            tag {
              tagId
              name
              description
              displayOrder
              createdAt
              updatedAt
            }
          }          
        }
        totalCount
        hasNextPage
      },
    }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 3, offset: 0 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
				],
			},
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 source 1 language 2 tag 1,3 2003-02-14T21:00:00.000Z
		// id note 2 source 1 language 1 tag 1   2003-02-15T06:00:00.000Z
		// id note 3 source 2 language 2 tag 1,2 2003-02-15T11:00:00.000Z
		// id note 4 source 2 language 1 tag 2   2003-02-16T03:15:00.000Z
		// id note 5 source 2 language 1 tag 1   2003-02-16T03:16:00.000Z

		// should be sorted to:

		// id note 5 source 2 language 1 tag 1   2003-02-16T03:16:00.000Z page 1
		// id note 4 source 2 language 1 tag 2   2003-02-16T03:15:00.000Z page 1
		// id note 3 source 2 language 2 tag 1,2 2003-02-15T11:00:00.000Z page 1
		// id note 2 source 1 language 1 tag 1   2003-02-15T06:00:00.000Z page 2
		// id note 1 source 1 language 2 tag 1,3 2003-02-14T21:00:00.000Z page 2

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(3);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(5);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id5");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-16T03:16:00.000Z");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_2");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(2);
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_1");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(1);

			const note1Tags: Collection<NoteTag> | undefined = note1.tags;
			expect(note1Tags[0].tag).toBeDefined();

			const tag11 = note1Tags[0].tag as unknown as Tag;
			expect(tag11.name).toEqual("tag_1");
			expect(tag11.displayOrder).toEqual(1);

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id4");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-16T03:15:00.000Z");
			expect(note2.source.name).toBeDefined();
			expect(note2.source.name).toEqual("source_2");
			expect(note2.source.description).toBeDefined();
			expect(note2.source.description).toBeNull();
			expect(note2.source.displayOrder).toBeDefined();
			expect(note2.source.displayOrder).toEqual(2);
			expect(note2.language.name).toBeDefined();
			expect(note2.language.name).toEqual("language_1");
			expect(note2.language.description).toBeDefined();
			expect(note2.language.description).toBeNull();
			expect(note2.language.displayOrder).toBeDefined();
			expect(note2.language.displayOrder).toEqual(1);

			const note2Tags: Collection<NoteTag> | undefined = note2.tags;
			expect(note2Tags[0].tag).toBeDefined();

			const tag21 = note2Tags[0].tag as unknown as Tag;
			expect(tag21.name).toEqual("tag_2");
			expect(tag21.displayOrder).toEqual(2);

			const note3: Note = responseData.items[2];
			expect(note3.internalId).toBeDefined();
			expect(note3.internalId).toEqual("int_id3");
			expect(note3.date).toBeDefined();
			expect(note3.date).toEqual("2003-02-15T11:00:00.000Z");
			expect(note3.source.name).toBeDefined();
			expect(note3.source.name).toEqual("source_2");
			expect(note3.source.description).toBeDefined();
			expect(note3.source.description).toBeNull();
			expect(note3.source.displayOrder).toBeDefined();
			expect(note3.source.displayOrder).toEqual(2);
			expect(note3.language.name).toBeDefined();
			expect(note3.language.name).toEqual("language_2");
			expect(note3.language.description).toBeDefined();
			expect(note3.language.description).toBeNull();
			expect(note3.language.displayOrder).toBeDefined();
			expect(note3.language.displayOrder).toEqual(2);

			const note3Tags: Collection<NoteTag> | undefined = note3.tags;

			expect(note3Tags[0].tag).toBeDefined();

			const tag31 = note3Tags[0].tag as unknown as Tag;
			expect(tag31.name).toEqual("tag_1");
			expect(tag31.displayOrder).toEqual(1);

			const tag32 = note3Tags[1].tag as unknown as Tag;
			expect(tag32.name).toEqual("tag_2");
			expect(tag32.displayOrder).toEqual(2);
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
			},
			pagination: { limit: 10, offset: 3 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
				],
			},
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(5);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id2");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-15T06:00:00.000Z");
			expect(note1.source.name).toBeDefined();
			expect(note1.source.name).toEqual("source_1");
			expect(note1.source.description).toBeDefined();
			expect(note1.source.description).toBeNull();
			expect(note1.source.displayOrder).toBeDefined();
			expect(note1.source.displayOrder).toEqual(1);
			expect(note1.language.name).toBeDefined();
			expect(note1.language.name).toEqual("language_1");
			expect(note1.language.description).toBeDefined();
			expect(note1.language.description).toBeNull();
			expect(note1.language.displayOrder).toBeDefined();
			expect(note1.language.displayOrder).toEqual(1);

			const note1Tags: Collection<NoteTag> | undefined = note1.tags;

			expect(note1Tags[0].tag).toBeDefined();

			const tag11 = note1Tags[0].tag as unknown as Tag;
			expect(tag11.name).toEqual("tag_1");
			expect(tag11.displayOrder).toEqual(1);

			// id note 1 source 1 language 2 tag 1,3 2003-02-14T21:00:00.000Z page 2

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id1");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-14T21:00:00.000Z");
			expect(note2.source.name).toBeDefined();
			expect(note2.source.name).toEqual("source_1");
			expect(note2.source.description).toBeDefined();
			expect(note2.source.description).toBeNull();
			expect(note2.source.displayOrder).toBeDefined();
			expect(note2.source.displayOrder).toEqual(1);
			expect(note2.language.name).toBeDefined();
			expect(note2.language.name).toEqual("language_2");
			expect(note2.language.description).toBeDefined();
			expect(note2.language.description).toBeNull();
			expect(note2.language.displayOrder).toBeDefined();
			expect(note2.language.displayOrder).toEqual(2);

			const note2Tags: Collection<NoteTag> | undefined = note2.tags;

			expect(note2Tags[0].tag).toBeDefined();

			const tag21 = note2Tags[0].tag as unknown as Tag;
			expect(tag21.name).toEqual("tag_1");
			expect(tag21.displayOrder).toEqual(1);
			const tag22 = note2Tags[1].tag as unknown as Tag;
			expect(tag22.name).toEqual("tag_3");
			expect(tag22.displayOrder).toEqual(3);
		}
	});

	test("query searchNotes date, text filters; sorted, paginated test", async () => {
		// add notes for test
		await dbSetup();
		const notes = [
			{
				id: 1,
				internalId: "int_id1",
				title: "banana",
				body: "orange",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				id: 2,
				internalId: "int_id2",
				title: "apple",
				body: "strawberry banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "apple",
				body: "various words and a banana",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "strawberry",
				body: "orange strawberry",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
			{
				id: 5,
				internalId: "int_id5",
				title: "grape",
				body: "dragonfruit",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 16, 0),
			},
			{
				id: 6,
				internalId: "int_id6",
				title: "banana",
				body: "peach",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 17, 0),
			},
			{
				id: 7,
				internalId: "int_id7",
				title: "pear",
				body: "kiwi",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 18, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const query = `query SearchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!, $sortInput: NoteMultiSortInput) {
      searchNotes(pagination: $pagination, searchInput: $searchInput, sortInput: $sortInput) {
          items {
            noteId
            internalId
            title
            body
            date
            createdAt
            updatedAt
          }
          totalCount
          hasNextPage
        }
      }`;

		let variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "banana",
			},
			pagination: { limit: 2, offset: 0 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
				],
			},
		};

		let response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		// id note 1 source 1 language 1 banana : orange                    2003-02-14T21:00:00.000Z [match]
		// id note 2 source 1 language 2 apple : strawberry banana          2003-02-15T06:00:00.000Z [match]
		// id note 3 source 1 language 2 apple : various words and a banana 2003-02-15T11:00:00.000Z [match]
		// id note 4 source 1 language 1 strawberry : orange strawberry     2003-02-16T03:15:00.000Z
		// id note 5 source 1 language 1 grape : dragonfruit                2003-02-16T03:16:00.000Z
		// id note 6 source 1 language 1 banana : peach                     2003-02-16T03:17:00.000Z [match]
		// id note 7 source 1 language 1 pear : kiwi                        2003-02-16T03:18:00.000Z

		// should be matched, sorted as

		// id note 6 source 1 language 1 banana : peach                     2003-02-16T03:17:00.000Z page 1
		// id note 3 source 1 language 2 apple : various words and a banana 2003-02-15T11:00:00.000Z page 1
		// id note 2 source 1 language 2 apple : strawberry banana          2003-02-15T06:00:00.000Z page 2
		// id note 1 source 1 language 1 banana : orange                    2003-02-14T21:00:00.000Z page 2

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeTruthy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id6");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("banana");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("peach");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-16T03:17:00.000Z");

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id3");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("apple");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("various words and a banana");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-15T11:00:00.000Z");
		}

		variables = {
			searchInput: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 18, 20, 0, 0),
				searchPhrase: "banana",
			},
			pagination: { limit: 2, offset: 2 },
			sortInput: {
				sorts: [
					{
						field: "date",
						sort: "desc",
					},
				],
			},
		};

		response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.searchNotes != null
		) {
			const responseData = response.body.singleResult.data
				.searchNotes as NotesPaginated;

			expect(responseData.items).toHaveLength(2);

			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(4);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const note1: Note = responseData.items[0];
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id2");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("apple");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("strawberry banana");
			expect(note1.date).toBeDefined();
			expect(note1.date).toEqual("2003-02-15T06:00:00.000Z");

			const note2: Note = responseData.items[1];
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id1");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("banana");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("orange");
			expect(note2.date).toBeDefined();
			expect(note2.date).toEqual("2003-02-14T21:00:00.000Z");
		}
	});

	test("query getNotesByInternalIds searchNotes", async () => {
		// add notes for test
		await dbSetup();
		const notes = [
			{
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `query GetNotesByInternalIds($internalIds: [String!]!) {
      getNotesByInternalIds(internalIds: $internalIds) {
        noteId
        internalId
        title
        body
        date
        createdAt
        updatedAt
      }
    }`;

		const variables = {
			internalIds: ["int_id2", "int_id1"],
		};

		const response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.getNotesByInternalIds != null
		) {
			const notes = response.body.singleResult.data
				.getNotesByInternalIds as Note[];

			expect(notes).toHaveLength(2);

			const note1: Note | undefined = notes.find(
				(note) => note.internalId === "int_id1",
			);

			if (note1 !== undefined) {
				expect(note1.internalId).toBeDefined();
				expect(note1.internalId).toEqual("int_id1");
				expect(note1.title).toBeDefined();
				expect(note1.title).toEqual("title1");
				expect(note1.body).toBeDefined();
				expect(note1.body).toEqual("body1");
				expect(note1.date).toBeDefined();
				expect(note1.date).toEqual("2003-02-14T21:00:00.000Z");
			} else {
				fail();
			}

			const note2: Note | undefined = notes.find(
				(note) => note.internalId === "int_id2",
			);

			if (note2 !== undefined) {
				expect(note2.internalId).toBeDefined();
				expect(note2.internalId).toEqual("int_id2");
				expect(note2.title).toBeDefined();
				expect(note2.title).toEqual("title2");
				expect(note2.body).toBeDefined();
				expect(note2.body).toEqual("body2");
				expect(note2.date).toBeDefined();
				expect(note2.date).toEqual("2003-02-15T06:00:00.000Z");
			} else {
				fail();
			}
		}
	});
});

describe("Note Mutations Resolver Integration Test", () => {
	const isTestDbFileEnabled: boolean = process.env.TEST_DB_FILE
		? process.env.TEST_DB_FILE.toLowerCase() === "true"
		: false;
	let orm: MikroORM;
	let em: EntityManager;
	let apolloServer: ApolloServer<CommonContext>;
	let tmpDbFile: string;
	const unlinkAsync = promisify(fs.unlink);

	beforeEach(async () => {
		try {
			if (isTestDbFileEnabled) {
				tmpDbFile = path.join(
					os.tmpdir(),
					`${generateInsecureRandomID()}.db.test.sqlite`,
				);
			} else {
				tmpDbFile = ":memory:";
			}
			const ormTestConfig = {
				dbName: tmpDbFile,
				driver: SqliteDriver,
				extensions: [Migrator],
				entities: ["dist/src/entities/*.entity.js"],
				entitiesTs: ["src/entities/*.entity.ts"],
				debug: false,
				//debug: true,
				logger: (message: string) => {
					console.info(message);
				},
				migrations: {
					path: "dist/src/migrations",
					glob: "*.migration.{js,ts}",
				},
			} satisfies Parameters<typeof MikroORM.init>[0];
			orm = await MikroORM.init(ormTestConfig);
			const migrator = orm.getMigrator();
			await migrator.up();
			const migrations = await migrator.getPendingMigrations();
			if (migrations.length > 0) {
				await migrator.up();
			}
		} catch (error) {
			console.error("Could not connect to the database", error);
			throw error;
		}

		const schema = await buildSchema({
			resolvers: [NoteResolver],
		});

		apolloServer = new ApolloServer<CommonContext>({
			schema,
		});

		em = orm.em.fork();
	});

	afterEach(async () => {
		await orm.close(true);
		if (isTestDbFileEnabled) {
			await unlinkAsync(tmpDbFile);
		}
	});

	async function dbSetup(): Promise<void> {
		// add sources for test
		const sources: Source[] = [];
		const languages: Language[] = [];
		const tags: Tag[] = [];
		const date = new Date(2003, 1, 14, 20, 0, 0);
		const totalCount = 4;
		for (let i = 1; i <= totalCount; i++) {
			sources.push({
				id: i,
				name: `source_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
			languages.push({
				id: i,
				name: `language_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
			tags.push({
				id: i,
				name: `tag_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
		}

		await em.upsertMany(Source, sources, { onConflictAction: "ignore" });
		await em.upsertMany(Language, languages, { onConflictAction: "ignore" });
		await em.upsertMany(Tag, tags, { onConflictAction: "ignore" });
		await em.flush();
	}

	test("mutation saveNote; insert test", async () => {
		await dbSetup();

		const query = `mutation SaveNote($data: NoteInput!) {
                      saveNote(data: $data) {
                        noteId
                        internalId
                        title
                        body
                        sourceId
                        languageId
                        date
                        createdAt
                        updatedAt
                      }
                    }`;

		const variables = {
			data: {
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				sourceId: 1,
				languageId: 1,
				date: "2024-08-19T12:00:00.000Z",
			},
		};
		const response = await apolloServer.executeOperation(
			{
				query: query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.saveNote != null
		) {
			const responseData = response.body.singleResult.data
				.saveNote as NoteFlat;

			expect(responseData.internalId).toEqual("int_id1");
			expect(responseData.title).toEqual("title1");
			expect(responseData.body).toEqual("body1");
			expect(responseData.sourceId).toEqual("1");
			expect(responseData.languageId).toEqual("1");
			expect(responseData.date).toEqual("2024-08-19T12:00:00.000Z");
		}
	});

	test("mutation saveNote; update test", async () => {
		await dbSetup();

		const note = em.create(Note, {
			id: 1,
			internalId: "int_id1",
			title: "title1",
			body: "body1",
			source: rel(Source, 1),
			language: rel(Language, 1),
			date: new Date(2003, 1, 14, 21, 0, 0),
		});

		await em.persistAndFlush(note);

		const query = `mutation SaveNote($data: NoteInput!, $saveNoteId: ID) {
                      saveNote(data: $data, id: $saveNoteId) {
                        noteId
                        internalId
                        title
                        body
                        sourceId
                        languageId
                        date
                        createdAt
                        updatedAt
                      }
                    }`;

		const variables = {
			data: {
				internalId: "int_id1_new",
				title: "title1_new",
				body: "body1_new",
				sourceId: 2,
				languageId: 2,
				date: "2024-08-19T12:00:00.000Z",
			},
			saveNoteId: 1,
		};
		const response = await apolloServer.executeOperation(
			{
				query: query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.saveNote != null
		) {
			const responseData = response.body.singleResult.data
				.saveNote as NoteFlat;

			expect(responseData.internalId).toEqual("int_id1_new");
			expect(responseData.title).toEqual("title1_new");
			expect(responseData.body).toEqual("body1_new");
			expect(responseData.sourceId).toEqual("2");
			expect(responseData.languageId).toEqual("2");
			expect(responseData.date).toEqual("2024-08-19T12:00:00.000Z");
		}
	});

	test("mutation deleteNote", async () => {
		await dbSetup();

		const note = em.create(Note, {
			id: 1,
			internalId: "int_id1",
			title: "title1",
			body: "body1",
			source: rel(Source, 1),
			language: rel(Language, 1),
			date: new Date(2003, 1, 14, 21, 0, 0),
		});

		await em.persistAndFlush(note);

		let query = `mutation deleteNote($deleteNoteId: ID!) {
                    deleteNote(id: $deleteNoteId)
                  }`;

		const variables = {
			deleteNoteId: 1,
		};

		let response = await apolloServer.executeOperation(
			{
				query: query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.deleteNote != null
		) {
			const responseData = response.body.singleResult.data
				.deleteNote as boolean;
			expect(responseData).toBeTruthy();
		}

		query = `query GetNotesByInternalIds($internalIds: [String!]!) {
      getNotesByInternalIds(internalIds: $internalIds) {
        noteId
      }
    }`;

		const variables2 = {
			internalIds: ["int_id1"],
		};

		response = await apolloServer.executeOperation(
			{
				query: query,
				variables: variables2,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.getNotesByInternalIds != null
		) {
			const responseData = response.body.singleResult.data
				.getNotesByInternalIds as Note[];
			expect(responseData).toHaveLength(0);
		}

		//simulate independent request in this context...
		em.clear();

		//... to check on db
		const searchedNote = await em.findOne(Note, { id: 1 });
		expect(searchedNote).toBeNull();
	});

	test("mutation deleteNotesInInterval with full interval", async () => {
		await dbSetup();

		const notes = [
			{
				id: 1,
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				id: 2,
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `mutation DeleteNotesInInterval($interval: NoteDeleteIntervalInput!) {
      deleteNotesInInterval(interval: $interval)
    }`;

		const variables = {
			interval: {
				fromDate: new Date(2003, 1, 14, 20, 0, 0),
				toDate: new Date(2003, 1, 16, 0, 0, 0),
			},
		};

		const response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.deleteNotesInInterval != null
		) {
			const value = response.body.singleResult.data
				.deleteNotesInInterval as boolean;

			expect(value).toBeTruthy();
		}

		//expecting that note id 4 still exist.
		const note4 = await em.findOne(Note, { id: 4 });
		expect(note4).toBeDefined();
		expect(note4?.internalId).toBeDefined();
		expect(note4?.internalId).toEqual("int_id4");
		expect(note4?.title).toBeDefined();
		expect(note4?.title).toEqual("title4");
		expect(note4?.body).toBeDefined();
		expect(note4?.body).toEqual("body4");
		expect(note4?.date).toBeDefined();
		expect(note4?.date).toEqual(new Date(2003, 1, 16, 3, 15, 0));

		//expect tags to be pnote of cascading, so empty collection
		const noteTags = await em.find(NoteTag, {});
		expect(noteTags).toBeDefined();
		expect(noteTags).toHaveLength(0);
	});

	test("mutation deleteNotesInInterval toDate", async () => {
		await dbSetup();

		const notes = [
			{
				id: 1,
				internalId: "int_id1",
				title: "title1",
				body: "body1",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 14, 21, 0, 0),
			},
			{
				id: 2,
				internalId: "int_id2",
				title: "title2",
				body: "body2",
				source: 1,
				language: 2,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 2,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 2,
				language: 2,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);

		const notesTags = [
			{ note: ref(Note, 1), tag: ref(Tag, 1) },
			{ note: ref(Note, 1), tag: ref(Tag, 3) },
			{ note: ref(Note, 2), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 1) },
			{ note: ref(Note, 3), tag: ref(Tag, 2) },
		].map((notesTagData) => em.create(NoteTag, notesTagData));

		await em.persistAndFlush(notesTags);

		const query = `mutation DeleteNotesInInterval($interval: NoteDeleteIntervalInput!) {
      deleteNotesInInterval(interval: $interval)
    }`;

		const variables = {
			interval: {
				toDate: new Date(2003, 1, 15, 7, 0, 0),
			},
		};

		const response = await apolloServer.executeOperation(
			{
				query,
				variables,
			},
			{
				contextValue: {
					em: orm.em.fork(),
				},
			},
		);

		expect(response.body.kind === "single");
		if (
			response.body.kind === "single" &&
			response.body.singleResult.errors !== undefined
		) {
			fail();
		}
		if (
			response.body.kind === "single" &&
			response.body.singleResult.data?.deleteNotesInInterval != null
		) {
			const value = response.body.singleResult.data
				.deleteNotesInInterval as boolean;

			expect(value).toBeTruthy();
		}

		//expecting that note id 3 still exist.
		const note3 = await em.findOne(
			Note,
			{ id: 3 },
			{ populate: ["tags.tag"] },
		);
		expect(note3).toBeDefined();
		expect(note3?.internalId).toBeDefined();
		expect(note3?.internalId).toEqual("int_id3");
		expect(note3?.title).toBeDefined();
		expect(note3?.title).toEqual("title3");
		expect(note3?.body).toBeDefined();
		expect(note3?.body).toEqual("body3");
		expect(note3?.date).toBeDefined();
		expect(note3?.date).toEqual(new Date(2003, 1, 15, 11, 0, 0));
		expect(note3?.tags).toHaveLength(2);

		const noteTags: Collection<NoteTag> | undefined = note3?.tags;
		if (noteTags) {
			expect(noteTags[0].tag).toBeDefined();

			const tag1 = noteTags[0].tag as unknown as Tag;
			expect(tag1.name).toEqual("tag_1");
			expect(tag1.displayOrder).toEqual(1);
			const tag2 = noteTags[1].tag as unknown as Tag;
			expect(tag2.name).toEqual("tag_2");
			expect(tag2.displayOrder).toEqual(2);
		} else {
			fail();
		}

		//expecting that note id 4 still exist.
		const note4 = await em.findOne(Note, { id: 4 });
		expect(note4).toBeDefined();
		expect(note4?.internalId).toBeDefined();
		expect(note4?.internalId).toEqual("int_id4");
		expect(note4?.title).toBeDefined();
		expect(note4?.title).toEqual("title4");
		expect(note4?.body).toBeDefined();
		expect(note4?.body).toEqual("body4");
		expect(note4?.date).toBeDefined();
		expect(note4?.date).toEqual(new Date(2003, 1, 16, 3, 15, 0));
		expect(note4?.tags).toHaveLength(0);
	});
});
