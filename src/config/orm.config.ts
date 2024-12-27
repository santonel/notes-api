import type { MikroORM } from "@mikro-orm/core";
import { Migrator } from "@mikro-orm/migrations";
import { SeedManager } from "@mikro-orm/seeder";
import { SqliteDriver } from "@mikro-orm/sqlite";

export default {
	dbName: process.env.DB ? process.env.DB : "database.sqlite",
	driver: SqliteDriver,
	extensions: [Migrator, SeedManager],
	entities: ["dist/src/entities/*.entity.js"],
	entitiesTs: ["src/entities/*.entity.ts"],
	debug: process.env.NODE_ENV === "development",
	logger: (message: string) => {
		console.info(message);
	},
	migrations: {
		path: "dist/src/migrations",
		glob: "*.migration.{js,ts}",
	},
} satisfies Parameters<typeof MikroORM.init>[0];
