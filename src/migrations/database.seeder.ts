import type { EntityManager } from "@mikro-orm/core";
import { Seeder } from "@mikro-orm/seeder";
import { Language } from "../entities/language.entity";
import { Source } from "../entities/source.entity";
import { Tag } from "../entities/tag.entity";

export class DatabaseSeeder extends Seeder {
	async run(em: EntityManager): Promise<void> {
		const sources: Source[] = [
			{
				id: 1,
				name: "School",
				description: null,
				displayOrder: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 2,
				name: "Work",
				description: null,
				displayOrder: 2,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 3,
				name: "Leisure",
				description: null,
				displayOrder: 3,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		await em.upsertMany(Source, sources, { onConflictAction: "ignore" });

		const languages: Language[] = [
			{
				id: 1,
				name: "English",
				description: null,
				displayOrder: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		await em.upsertMany(Language, languages, { onConflictAction: "ignore" });

		const tags: Tag[] = [
			{
				id: 1,
				name: "Draft",
				description: null,
				displayOrder: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 2,
				name: "Obsolete",
				description: null,
				displayOrder: 2,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: 3,
				name: "Todo",
				description: null,
				displayOrder: 3,
				createdAt: new Date(),
				updatedAt: new Date(),
			}
		];
		await em.upsertMany(Tag, tags, { onConflictAction: "ignore" });
	}
}
