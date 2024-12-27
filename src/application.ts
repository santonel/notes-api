import http from "node:http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { MikroORM } from "@mikro-orm/core";
import compression from "compression";
import cors from "cors";
import express from "express";
import { buildSchema } from "type-graphql";
import healthChecker from "./api/health/healthchecker.api";
import ormConfig from "./config/orm.config";
import { DatabaseSeeder } from "./migrations/database.seeder";
import { LanguageResolver } from "./resolvers/language.resolver";
import { NoteResolver } from "./resolvers/note.resolver";
import { SourceResolver } from "./resolvers/source.resolver";
import { TagResolver } from "./resolvers/tag.resolver";
import { ViewResolver } from "./resolvers/view.resolver";
import type { CommonContext } from "./utils/interfaces/context.interface";

export default class Application {
	public originConfig: string[];
	public orm: MikroORM;
	public expressApp: express.Application;
	public httpServer: http.Server;

	public connect = async (): Promise<void> => {
		try {
			this.orm = await MikroORM.init(ormConfig);
			const migrator = this.orm.getMigrator();
			await migrator.up();
			const migrations = await migrator.getPendingMigrations();
			if (migrations.length > 0) {
				await migrator.up();
			}
			const seeder = this.orm.getSeeder();
			await seeder.seed(DatabaseSeeder);
		} catch (error) {
			console.error("Could not connect to the database", error);
			throw error;
		}
	};

	public init = async (): Promise<void> => {
		this.expressApp = express();
		this.httpServer = http.createServer(this.expressApp);
		try {
			let originConfig: boolean | string[] = true;
			if (process.env.ALLOW_LIST !== undefined) {
				originConfig = process.env.ALLOW_LIST.split(",").map((url) =>
					url.trim(),
				);
			}

			const schema = await buildSchema({
				emitSchemaFile: "schema.gql",
				resolvers: [
					NoteResolver,
					SourceResolver,
					LanguageResolver,
					TagResolver,
					ViewResolver,
				],
				validate: true,
			});

			const apolloServer = new ApolloServer<CommonContext>({
				schema,
				logger: console,
				plugins: [
					ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),
				],
			});

			await apolloServer.start();

			this.expressApp.use(compression());
			this.expressApp.get(
				"/health",
				cors({ origin: originConfig }),
				(req, res) => {
					void healthChecker(req, res, this.orm.em.fork());
				},
			);

			this.expressApp.use(
				"/graphql",
				cors({ origin: originConfig }),
				express.json(),
				expressMiddleware(apolloServer, {
					context: async ({ req, res }) => ({
						req,
						res,
						em: this.orm.em.fork(),
					}),
				}),
			);

			const port: number = Number.parseInt(process.env.PORT ?? "4000");

			this.httpServer.listen({ port });
			console.log(`Express server started on port ${port.toString()}`);
		} catch (error) {
			console.error("Could not start server", error);
		}
	};
}
