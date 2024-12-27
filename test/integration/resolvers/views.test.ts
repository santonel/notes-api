import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ApolloServer } from "@apollo/server";
import {
	type EntityManager,
	type FilterQuery,
	type FindAllOptions,
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
	type NotesPaginated,
} from "../../../src/entities/note.entity";
import { Source } from "../../../src/entities/source.entity";
import { Tag } from "../../../src/entities/tag.entity";
import {
	View,
	type ViewFlat,
	ViewNote,
	type ViewNotesPaginated,
	type ViewsPaginated,
} from "../../../src/entities/view.entity";
import { ViewResolver } from "../../../src/resolvers/view.resolver";
import type { CommonContext } from "../../../src/utils/interfaces/context.interface";
import { generateInsecureRandomID } from "../../../src/utils/service/identity.service";

describe("Views Queries Resolver Integration Test", () => {
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
			resolvers: [ViewResolver],
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

		// add notes for test
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
				language: 1,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);
	}

	test("query getViewsByInternalIds", async () => {
		await dbSetup();

		//add views for test
		const views = [
			{ internalId: "view_id_1", name: "view_1", source: 1, language: 1, displayOrder: 1 },
			{ internalId: "view_id_2", name: "view_2", source: 2, language: 1, displayOrder: 2 },
		].map((viewData) => em.create(View, viewData));

		await em.persistAndFlush(views);

		const viewNotes = [
			{ view: ref(View, 1), note: ref(Note, 1), displayOrder: 2 },
			{ view: ref(View, 1), note: ref(Note, 2), displayOrder: 1 },
			{ view: ref(View, 2), note: ref(Note, 3), displayOrder: 2 },
			{ view: ref(View, 2), note: ref(Note, 4), displayOrder: 1 },
		].map((viewsNoteData) => em.create(ViewNote, viewsNoteData));

		await em.persistAndFlush(viewNotes);

		const query = `query GetViewsByInternalIds($internalIdsInput: ViewInternalIdsInput!) {
                                getViewsByInternalIds(internalIdsInput: $internalIdsInput) {
                                        viewId
                                        internalId
                                        name
                                        source {
                                            sourceId
                                            name
                                        }
                                        language {
                                            languageId
                                            name
                                        }
                                        createdAt
                                        updatedAt
                                    }
                                }`;

		let variables = {
			internalIdsInput: {
				internalIds: ["view_id_1", "view_id_2", "view_id_3"],
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
			response.body.singleResult.data?.getViewsByInternalIds != null
		) {
			const responseData = response.body.singleResult.data
				.getViewsByInternalIds as View[];
			expect(responseData).toHaveLength(2);

			const view1: View = responseData[0] as unknown as View;
			expect(view1.internalId).toBeDefined();
			expect(view1.internalId).toEqual("view_id_1");
			expect(view1.name).toBeDefined();
			expect(view1.name).toEqual("view_1");
			expect(view1.language).toBeDefined();
			expect(view1.language.name).toBeDefined();
			expect(view1.language.name).toEqual("language_1");
			expect(view1.source).toBeDefined();
			expect(view1.source.name).toBeDefined();
			expect(view1.source.name).toEqual("source_1");

			const view2: View = responseData[1] as unknown as View;
			expect(view2.internalId).toBeDefined();
			expect(view2.internalId).toEqual("view_id_2");
			expect(view2.name).toBeDefined();
			expect(view2.name).toEqual("view_2");
			expect(view2.language).toBeDefined();
			expect(view2.language.name).toBeDefined();
			expect(view2.language.name).toEqual("language_1");
			expect(view2.source).toBeDefined();
			expect(view2.source.name).toBeDefined();
			expect(view2.source.name).toEqual("source_2");

			expect(true).toBeTruthy();
		}

		const internalIdsArray: string[] = Array.from(
			{ length: 30 },
			(_, i) => `view_not_exisiting_${(i + 1).toString()}`,
		);

		variables = {
			internalIdsInput: {
				internalIds: internalIdsArray,
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
			const errorData = response.body.singleResult.errors[0];

			expect(errorData.message).toBeDefined();
			expect(errorData.message).toEqual("Argument Validation Error");
		}
	});

	test("query getViewNotesPaginatedByViewIds; paginated test", async () => {
		await dbSetup();

		//add views for test
		const views = [
			{ internalId: "view_id_1", name: "view_1", source: 1, language: 1, displayOrder: 1 },
			{ internalId: "view_id_2", name: "view_2", source: 1, language: 1, displayOrder: 2 },
		].map((viewData) => em.create(View, viewData));

		await em.persistAndFlush(views);

		const viewNotes = [
			{ view: ref(View, 1), note: ref(Note, 1), displayOrder: 2 },
			{ view: ref(View, 1), note: ref(Note, 2), displayOrder: 1 },
			{ view: ref(View, 2), note: ref(Note, 3), displayOrder: 2 },
			{ view: ref(View, 2), note: ref(Note, 4), displayOrder: 1 },
		].map((viewsNoteData) => em.create(ViewNote, viewsNoteData));

		await em.persistAndFlush(viewNotes);

		const query = `query GetViewNotesPaginatedByViewId($viewId: ID!, $pagination: PaginationInput!) {
                                getViewNotesPaginatedByViewId(viewId: $viewId, pagination: $pagination) {
                                    items {
                                    viewNoteId
                                    displayOrder
                                    note {
                                        noteId
                                        internalId
                                        source {
                                            sourceId
                                        }
                                        language {
                                            languageId
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
                                        date
                                        title
                                        body
                                        createdAt
                                        updatedAt
                                    }
                                    }
                                    hasNextPage
                                    totalCount
                                }
                                }`;

		const variables = {
			viewId: 1,
			pagination: { limit: 3, offset: 0 },
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
			response.body.singleResult.data?.getViewNotesPaginatedByViewId != null
		) {
			const responseData = response.body.singleResult.data
				.getViewNotesPaginatedByViewId as ViewNotesPaginated;
			expect(responseData.items).toHaveLength(2);
			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(2);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const noteView1: ViewNote = responseData.items[0];
			expect(noteView1.displayOrder).toBeDefined();
			expect(noteView1.displayOrder).toEqual(1);

			const note1: Note = responseData.items[0]
				.note as unknown as Note;
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id2");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("title2");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("body2");

			const noteView2: ViewNote = responseData.items[1];
			expect(noteView2.displayOrder).toBeDefined();
			expect(noteView2.displayOrder).toEqual(2);

			const note2: Note = responseData.items[1]
				.note as unknown as Note;
			expect(note2.internalId).toBeDefined();
			expect(note2.internalId).toEqual("int_id1");
			expect(note2.title).toBeDefined();
			expect(note2.title).toEqual("title1");
			expect(note2.body).toBeDefined();
			expect(note2.body).toEqual("body1");
		}
	});

	test("query searchViews", async () => {
		await dbSetup();

		//add views for test
		const views = [
			{ internalId: "view_id_1", name: "view_1", source: 1, language: 1, displayOrder: 1 },
			{ internalId: "view_id_2", name: "view_2", source: 2, language: 1, displayOrder: 2 },
			{ internalId: "view_id_3", name: "view_3", source: 1, language: 2, displayOrder: 1 },
			{ internalId: "view_id_4", name: "view_4", source: 2, language: 2, displayOrder: 2 },
		].map((viewData) => em.create(View, viewData));

		await em.persistAndFlush(views);

		const viewNotes = [
			{ view: ref(View, 1), note: ref(Note, 1), displayOrder: 2 },
			{ view: ref(View, 1), note: ref(Note, 2), displayOrder: 1 },
			{ view: ref(View, 2), note: ref(Note, 3), displayOrder: 2 },
			{ view: ref(View, 2), note: ref(Note, 4), displayOrder: 1 },
		].map((viewsNoteData) => em.create(ViewNote, viewsNoteData));

		await em.persistAndFlush(viewNotes);

		const query = `query SearchViews($paginationInput: PaginationInput!, $searchInput: SearchViewsInput!) {
                            searchViews(paginationInput: $paginationInput, searchInput: $searchInput) {
                                    items {
                                        viewId
                                        internalId
                                        name
                                        source {
                                            name
                                        }
                                        language {
                                            name
                                        }
                                        createdAt
                                        updatedAt
                                    }
                                    hasNextPage
                                    totalCount
                                }
                            }`;

		const variables = {
			paginationInput: {
				offset: 0,
				limit: 10,
			},
			searchInput: {
				languageIds: [1],
				sourceIds: [1],
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
			response.body.singleResult.data?.searchViews != null
		) {
			const responseData = response.body.singleResult.data
				.searchViews as ViewsPaginated;
			expect(responseData.items).toHaveLength(1);

			const view1: View = responseData.items[0] as unknown as View;
			expect(view1.internalId).toBeDefined();
			expect(view1.internalId).toEqual("view_id_1");
			expect(view1.name).toBeDefined();
			expect(view1.name).toEqual("view_1");
			expect(view1.language).toBeDefined();
			expect(view1.language.name).toBeDefined();
			expect(view1.language.name).toEqual("language_1");
			expect(view1.source).toBeDefined();
			expect(view1.source.name).toBeDefined();
			expect(view1.source.name).toEqual("source_1");
		}
	});
});

describe("Views Mutations Resolver Integration Test", () => {
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
			resolvers: [ViewResolver],
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

		// add notes for test
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
				language: 1,
				date: new Date(2003, 1, 15, 6, 0, 0),
			},
			{
				id: 3,
				internalId: "int_id3",
				title: "title3",
				body: "body3",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 15, 11, 0, 0),
			},
			{
				id: 4,
				internalId: "int_id4",
				title: "title4",
				body: "body4",
				source: 1,
				language: 1,
				date: new Date(2003, 1, 16, 3, 15, 0),
			},
		].map((noteData) => em.create(Note, noteData));

		await em.persistAndFlush(notes);
	}

	test("mutation saveView; insert test", async () => {
		await dbSetup();

		const query = `mutation saveView($data: ViewInput!) {
                        saveView(data: $data) {
                                viewId
                                internalId
                                name
                                sourceId
                                languageId
								displayOrder
                                createdAt
                                updatedAt
                            }
                        }`;

		const variables = {
			data: {
				internalId: "internal_id_1",
				name: "view_1",
				sourceId: 1,
				languageId: 1,
				displayOrder: 1
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
			response.body.singleResult.data?.saveView != null
		) {
			const responseData = response.body.singleResult.data.saveView as ViewFlat;

			expect(responseData.internalId).toEqual("internal_id_1");
			expect(responseData.name).toEqual("view_1");
			expect(responseData.sourceId).toEqual("1");
			expect(responseData.languageId).toEqual("1");
			expect(responseData.displayOrder).toEqual(1);
			expect(responseData.createdAt).toBeDefined();
			expect(responseData.updatedAt).toBeDefined();
			expect(responseData.createdAt).toEqual(responseData.updatedAt);
		}
	});

	test("mutation saveView; update test", async () => {
		await dbSetup();

		const view = em.create(View, {
			id: 1,
			internalId: "internal_id_1",
			name: "view_1",
			language: rel(Language, 1),
			source: rel(Source, 1),
			displayOrder: 1,
			createdAt: new Date("2000-01-01T00:00:00"),
			updatedAt: new Date("2000-01-01T00:00:00"),
		});
		await em.persistAndFlush(view);

		const query = `mutation saveView($data: ViewInput!, $saveViewId: ID) {
                                saveView(data: $data, id: $saveViewId) {
                                    viewId
                                    internalId
                                    name
                                    sourceId
                                    languageId
									displayOrder
                                    createdAt
                                    updatedAt
                                }
                            }`;

		const variables = {
			data: {
				internalId: "internal_id_1_new",
				name: "view_1_new",
				sourceId: 2,
				languageId: 2,
				displayOrder: 2,
			},
			saveViewId: 1,
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
			response.body.singleResult.data?.saveView != null
		) {
			const responseData = response.body.singleResult.data.saveView as ViewFlat;

			expect(responseData.internalId).toEqual("internal_id_1_new");
			expect(responseData.name).toEqual("view_1_new");
			expect(responseData.sourceId).toEqual("2");
			expect(responseData.languageId).toEqual("2");
			expect(responseData.displayOrder).toEqual(2);

			if (responseData.createdAt && view.createdAt) {
				expect(new Date(responseData.createdAt).getTime()).toEqual(
					view.createdAt.getTime(),
				);
			}
			if (responseData.updatedAt && view.updatedAt) {
				expect(new Date(responseData.updatedAt).getTime()).toBeGreaterThan(
					view.updatedAt.getTime(),
				);
			}
		}
	});

	test("mutation deleteView", async () => {
		await dbSetup();

		const view = em.create(View, {
			id: 1,
			internalId: "internal_id_1",
			name: "view_1",
			language: rel(Language, 1),
			source: rel(Source, 1),
			displayOrder: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await em.persistAndFlush(view);

		let query = `mutation DeleteView($deleteViewId: ID!) {
                        deleteView(id: $deleteViewId)
                    }`;

		const variables = {
			deleteViewId: 1,
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
			response.body.singleResult.data?.deleteView != null
		) {
			const responseData = response.body.singleResult.data
				.deleteView as boolean;
			expect(responseData).toBeTruthy();
		}

		query = `query GetViewsByInternalIds($internalIdsInput: ViewInternalIdsInput!) {
                                getViewsByInternalIds(internalIdsInput: $internalIdsInput) {
                                    viewId
                                }
        }`;

		const variables2 = {
			internalIdsInput: {
				internalIds: ["internal_id_1"],
			},
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
			response.body.singleResult.data?.getViewsByInternalIds != null
		) {
			const responseData = response.body.singleResult.data
				.getViewsByInternalIds as View[];
			expect(responseData).toHaveLength(0);
		}

		//simulate independent request in this context...
		em.clear();

		//... to check on db
		const searchedView = await em.findOne(View, { id: 1 });
		expect(searchedView).toBeNull();
	});

	test("mutation associateNotesWithView", async () => {
		await dbSetup();

		//add views for test
		const views = [
			{
				id: 1,
				internalId: "view_id_1",
				name: "view_1",
				source: 1,
				language: 1,
				displayOrder: 1,
			},
			{
				id: 2,
				internalId: "view_id_2",
				name: "view_2",
				source: 2,
				language: 2,
				displayOrder: 2,
			},
			{
				id: 3,
				internalId: "view_id_3",
				name: "view_3",
				source: 1,
				language: 2,
				displayOrder: 3,
			},
		].map((viewData) => em.create(View, viewData));

		await em.persistAndFlush(views);

		const viewNotes = [
			{ view: ref(View, 1), note: ref(Note, 1), displayOrder: 0 },
			{ view: ref(View, 1), note: ref(Note, 2), displayOrder: 1 },
			{ view: ref(View, 2), note: ref(Note, 3), displayOrder: 0 },
			{ view: ref(View, 3), note: ref(Note, 1), displayOrder: 0 },
			{ view: ref(View, 3), note: ref(Note, 2), displayOrder: 1 },
			{ view: ref(View, 3), note: ref(Note, 3), displayOrder: 2 },
		].map((viewsNoteData) => em.create(ViewNote, viewsNoteData));

		await em.persistAndFlush(viewNotes);

		let query = `mutation AssociateNotesWithView($associations: ViewAssociationInput!) {
                        associateNotesWithView(associations: $associations)
                    }`;

		let variables = {
			associations: {
				viewId: 1,
				notes: [
					{
						noteId: 3,
						displayOrder: 0,
					},
					{
						noteId: 4,
						displayOrder: 1,
					},
				],
			},
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
			response.body.singleResult.data != null
		) {
			const responseData = response.body.singleResult.data;
			expect(responseData).toBeTruthy();
		}

		const where: FilterQuery<ViewNote> = {};
		where.view = { id: 1 };

		const options: FindAllOptions<ViewNote> = {
			populate: ["note"] as never[],
			orderBy: { displayOrder: "ASC" },
		};

		//load result from db and check it
		const viewNotesFromDb: ViewNote[] = await em.find(
			ViewNote,
			where,
			options,
		);

		if (viewNotesFromDb.length > 0) {
			expect(viewNotesFromDb).toHaveLength(2);

			const viewNote1: ViewNote = viewNotesFromDb[0];
			expect(viewNote1.displayOrder).toEqual(0);
			const note1 = viewNote1.note as unknown as Note;

			expect(note1.internalId).toEqual("int_id3");
			expect(note1.title).toEqual("title3");
			expect(note1.body).toEqual("body3");
			expect(note1.source.id).toEqual(1);
			expect(note1.language.id).toEqual(1);
			expect(note1.createdAt).toBeDefined();
			expect(note1.updatedAt).toBeDefined();

			const viewNote2: ViewNote = viewNotesFromDb[1];
			expect(viewNote2.displayOrder).toEqual(1);
			const note2 = viewNote2.note as unknown as Note;

			expect(note2.internalId).toEqual("int_id4");
			expect(note2.title).toEqual("title4");
			expect(note2.body).toEqual("body4");
			expect(note2.source.id).toEqual(1);
			expect(note2.language.id).toEqual(1);
			expect(note2.createdAt).toBeDefined();
			expect(note2.updatedAt).toBeDefined();
		} else {
			fail();
		}

		variables = {
			associations: {
				viewId: 453,
				notes: [
					{
						noteId: 3,
						displayOrder: 0,
					},
					{
						noteId: 4,
						displayOrder: 1,
					},
				],
			},
		};

		response = await apolloServer.executeOperation(
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
			const errorData = response.body.singleResult.errors[0];

			expect(errorData.message).toBeDefined();
			expect(errorData.message).toEqual("View with id 453 does not exist");
		} else {
			fail();
		}

		variables = {
			associations: {
				viewId: 1,
				notes: [
					{
						noteId: 576,
						displayOrder: 0,
					},
					{
						noteId: 422,
						displayOrder: 1,
					},
				],
			},
		};

		response = await apolloServer.executeOperation(
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
			const errorData = response.body.singleResult.errors[0];

			expect(errorData.message).toBeDefined();
			expect(errorData.message).toEqual(
				"Notes with ids 576, 422 do not exist",
			);
		} else {
			fail();
		}

		//cascade check, delete view 2 -> expecting note view associated to not exist anymore
		const view2 = await em.findOne(View, { id: 2 });
		if (view2) {
			await em.removeAndFlush(view2);
		}

		query = `query GetViewNotesPaginatedByViewId($viewId: ID!, $pagination: PaginationInput!) {
            getViewNotesPaginatedByViewId(viewId: $viewId, pagination: $pagination) {
                items {
                viewNoteId
                displayOrder
                note {
                    noteId
                    internalId
                    source {
                        sourceId
                    }
                    language {
                        languageId
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
                    date
                    title
                    body
                    createdAt
                    updatedAt
                }
                }
                hasNextPage
                totalCount
            }
            }`;

		const variables2 = {
			viewId: 2,
			pagination: { limit: 10, offset: 0 },
		};

		response = await apolloServer.executeOperation(
			{
				query,
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
			response.body.singleResult.data?.getViewNotesPaginatedByViewId != null
		) {
			const responseData = response.body.singleResult.data
				.getViewNotesPaginatedByViewId as NotesPaginated;
			expect(responseData.items).toHaveLength(0);
			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(0);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();
		}

		//cascade check, delete note 1 and 2 -> expecting note view 3 to contain a single note
		const note1 = await em.findOne(Note, { id: 1 });
		const note2 = await em.findOne(Note, { id: 2 });
		if (note1 && note2) {
			await em.removeAndFlush(note1);
			await em.removeAndFlush(note2);
		}

		variables2.viewId = 3;
		response = await apolloServer.executeOperation(
			{
				query,
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
			response.body.singleResult.data?.getViewNotesPaginatedByViewId != null
		) {
			const responseData = response.body.singleResult.data
				.getViewNotesPaginatedByViewId as NotesPaginated;
			expect(responseData.items).toHaveLength(1);
			expect(responseData.totalCount).toBeDefined();
			expect(responseData.totalCount).toEqual(1);
			expect(responseData.hasNextPage).toBeDefined();
			expect(responseData.hasNextPage).toBeFalsy();

			const noteView1: ViewNote = responseData
				.items[0] as unknown as ViewNote;
			expect(noteView1.displayOrder).toBeDefined();
			expect(noteView1.displayOrder).toEqual(2);

			const note1: Note = noteView1.note as unknown as Note;
			expect(note1.internalId).toBeDefined();
			expect(note1.internalId).toEqual("int_id3");
			expect(note1.title).toBeDefined();
			expect(note1.title).toEqual("title3");
			expect(note1.body).toBeDefined();
			expect(note1.body).toEqual("body3");
		}
	});
});
