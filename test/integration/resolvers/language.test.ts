import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ApolloServer } from "@apollo/server";
import { type EntityManager, MikroORM } from "@mikro-orm/core";
import { Migrator } from "@mikro-orm/migrations";
import { SqliteDriver } from "@mikro-orm/sqlite";
import { buildSchema } from "type-graphql";
import {
	Language,
	type LanguagesPaginated,
} from "../../../src/entities/language.entity";
import { LanguageResolver } from "../../../src/resolvers/language.resolver";
import type { CommonContext } from "../../../src/utils/interfaces/context.interface";
import { generateInsecureRandomID } from "../../../src/utils/service/identity.service";

describe("Language Resolver Integration Test", () => {
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
			resolvers: [LanguageResolver],
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

	test("query getLanguages paginated test", async () => {
		// remove seeded languages
		await em.nativeDelete(Language, {});
		// add languages for test
		const languages: Language[] = [];
		const date = new Date(2003, 1, 14, 20, 0, 0);
		const totalCount = 20;
		for (let i = 1; i <= totalCount; i++) {
			languages.push({
				id: i,
				name: `language_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
		}

		await em.upsertMany(Language, languages, { onConflictAction: "ignore" });

		const query = `query GetLanguages($paginationInput: PaginationInput!) {
      getLanguages(paginationInput: $paginationInput) {
        items {
          updatedAt
          createdAt
          displayOrder
          description
          name
          languageId
        }
        totalCount
        hasNextPage
      }
    }`;

		const variables = { paginationInput: { limit: 10, offset: 0 } };

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
			response.body.singleResult.data?.getLanguages != null
		) {
			const responseData = response.body.singleResult.data
				.getLanguages as LanguagesPaginated;

			expect(responseData.items).toHaveLength(10);

			const language: Language = responseData.items[0];

			expect(language.name).toBeDefined();
			expect(language.name).toEqual("language_1");
			expect(language.description).toBeDefined();
			expect(language.description).toBeNull();
			expect(language.displayOrder).toBeDefined();
			expect(language.displayOrder).toEqual(1);
			expect(language.createdAt).toBeDefined();
			expect(language.createdAt).toEqual("2003-02-14T20:00:00.000Z");
			expect(language.updatedAt).toBeDefined();
			expect(language.updatedAt).toEqual("2003-02-14T20:00:00.000Z");

			expect(responseData.totalCount).toEqual(totalCount);
			expect(responseData.hasNextPage).toBeTruthy();
		}
	});
});
