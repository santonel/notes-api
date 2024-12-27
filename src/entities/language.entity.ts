import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { Field, GraphQLISODateTime, ID, Int, ObjectType } from "type-graphql";

@ObjectType()
@Entity()
export class Language {
	@Field((_type) => ID, { name: "languageId" })
	@PrimaryKey({ name: "language_id" })
	public id!: number;

	@Field((_type) => String)
	@Property({ name: "name" })
	public name!: string;

	@Field((_type) => String, { nullable: true })
	@Property({ name: "description", nullable: true })
	public description: string | null;

	@Field((_type) => Int)
	@Property({ name: "display_order" })
	public displayOrder!: number;

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "created_at" })
	public createdAt?: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "updated_at", onUpdate: () => new Date() })
	public updatedAt?: Date = new Date();
}

@ObjectType()
export class LanguagesPaginated {
	@Field((_type) => [Language])
	public items: Language[];

	@Field((_type) => Int)
	public totalCount: number;

	@Field()
	public hasNextPage: boolean;

	constructor(items: Language[], totalCount: number, hasNextPage: boolean) {
		this.items = items;
		this.totalCount = totalCount;
		this.hasNextPage = hasNextPage;
	}
}
