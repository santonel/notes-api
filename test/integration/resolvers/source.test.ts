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
	Source,
	type SourcesPaginated,
} from "../../../src/entities/source.entity";
import { SourceResolver } from "../../../src/resolvers/source.resolver";
import type { CommonContext } from "../../../src/utils/interfaces/context.interface";
import { generateInsecureRandomID } from "../../../src/utils/service/identity.service";

describe("Source Resolver Integration Test", () => {
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
			resolvers: [SourceResolver],
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

	test("query getSources paginated test", async () => {
		// remove seeded sources
		await em.nativeDelete(Source, {});
		// add sources for test
		const sources: Source[] = [];
		const date = new Date(2003, 1, 14, 20, 0, 0);
		const totalCount = 20;
		for (let i = 1; i <= totalCount; i++) {
			sources.push({
				id: i,
				name: `source_${i.toString()}`,
				description: null,
				displayOrder: i,
				createdAt: date,
				updatedAt: date,
			});
		}

		await em.upsertMany(Source, sources, { onConflictAction: "ignore" });

		const query = `query GetSources($paginationInput: PaginationInput!) {
      getSources(paginationInput: $paginationInput) {
        items {
          updatedAt
          createdAt
          displayOrder
          description
          name
          sourceId
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
			response.body.singleResult.data?.getSources != null
		) {
			const responseData = response.body.singleResult.data
				.getSources as SourcesPaginated;

			expect(responseData.items).toHaveLength(10);

			const source: Source = responseData.items[0];

			expect(source.name).toBeDefined();
			expect(source.name).toEqual("source_1");
			expect(source.description).toBeDefined();
			expect(source.description).toBeNull();
			expect(source.displayOrder).toBeDefined();
			expect(source.displayOrder).toEqual(1);
			expect(source.createdAt).toBeDefined();
			expect(source.createdAt).toEqual("2003-02-14T20:00:00.000Z");
			expect(source.updatedAt).toBeDefined();
			expect(source.updatedAt).toEqual("2003-02-14T20:00:00.000Z");

			expect(responseData.totalCount).toEqual(totalCount);
			expect(responseData.hasNextPage).toBeTruthy();
		}
	});
});
