import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { Field, GraphQLISODateTime, ID, Int, ObjectType } from "type-graphql";

@ObjectType()
@Entity()
export class Tag {
	@Field((_type) => ID, { name: "tagId" })
	@PrimaryKey({ name: "tag_id" })
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
	@Property({ name: "created_at", onCreate: () => new Date() })
	public createdAt?: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "updated_at", onUpdate: () => new Date() })
	public updatedAt?: Date = new Date();
}

@ObjectType()
export class TagsPaginated {
	@Field((_type) => [Tag])
	public items: Tag[];

	@Field((_type) => Int)
	public totalCount: number;

	@Field()
	public hasNextPage: boolean;

	constructor(items: Tag[], totalCount: number, hasNextPage: boolean) {
		this.items = items;
		this.totalCount = totalCount;
		this.hasNextPage = hasNextPage;
	}
}
