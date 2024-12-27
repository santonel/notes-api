import {
	Collection,
	Entity,
	ManyToOne,
	OneToMany,
	PrimaryKey,
	Property,
	type Ref,
	Unique,
} from "@mikro-orm/core";
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsOptional,
	IsPositive,
} from "class-validator";
import {
	Field,
	GraphQLISODateTime,
	ID,
	InputType,
	Int,
	ObjectType,
} from "type-graphql";
import { Language } from "./language.entity";
import { Note } from "./note.entity";
import { Source } from "./source.entity";

@ObjectType()
@Entity()
export class View {
	@Field((_type) => ID, { name: "viewId" })
	@PrimaryKey({ name: "view_id" })
	public id: number;

	@Field()
	@Property({ name: "internal_id" })
	@Unique()
	public internalId!: string;

	@Field((_type) => String)
	@Property({ name: "name" })
	public name!: string;

	@Field((_type) => Source)
	@ManyToOne({ entity: () => Source, joinColumn: "source_id" })
	public source: Source;

	@Field((_type) => Language)
	@ManyToOne({ entity: () => Language, joinColumn: "language_id" })
	public language: Language;

	@Field((_type) => Int)
	@Property({ name: "display_order" })
	public displayOrder!: number;

	@OneToMany({ entity: () => ViewNote, mappedBy: "view" })
	public notes = new Collection<ViewNote>(this);

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "created_at", onCreate: () => new Date() })
	public createdAt?: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "updated_at", onUpdate: () => new Date() })
	public updatedAt?: Date = new Date();
}

@ObjectType()
export class ViewFlat {
	@Field((_type) => ID, { name: "viewId" })
	@PrimaryKey({ name: "view_id" })
	public id!: number;

	@Field()
	public internalId!: string;

	@Field()
	public name!: string;

	@Field((_type) => ID)
	public sourceId: number;

	@Field((_type) => ID)
	public languageId: number;

	@Field()
	public displayOrder: number;

	@Field((_type) => GraphQLISODateTime)
	public createdAt?: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	public updatedAt?: Date = new Date();

	constructor(view: View) {
		this.id = view.id;
		this.internalId = view.internalId;
		this.name = view.name;
		this.sourceId = view.source.id;
		this.languageId = view.language.id;
		this.displayOrder = view.displayOrder;
		this.createdAt = view.createdAt;
		this.updatedAt = view.updatedAt;
	}
}

@ObjectType()
@Entity()
export class ViewNote {
	@Field((_type) => ID, { name: "viewNoteId" })
	@PrimaryKey({ name: "view_note_id" })
	public id!: number;

	//@Field(_type => View, { nullable: false })
	@ManyToOne({ entity: () => View, fieldName: "view_id" })
	public view!: Ref<View>;

	@Field((_type) => Note, { nullable: false })
	@ManyToOne({ entity: () => Note, fieldName: "note_id" })
	public note!: Ref<Note>;

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
export class ViewsPaginated {
	@Field((_type) => [View])
	public items: View[];

	@Field((_type) => Int)
	public totalCount: number;

	@Field()
	public hasNextPage: boolean;

	constructor(items: View[], totalCount: number, hasNextPage: boolean) {
		this.items = items;
		this.totalCount = totalCount;
		this.hasNextPage = hasNextPage;
	}
}

@ObjectType()
export class ViewNotesPaginated {
	@Field((_type) => [ViewNote])
	public items: ViewNote[];

	@Field((_type) => Int)
	public totalCount: number;

	@Field()
	public hasNextPage: boolean;

	constructor(items: ViewNote[], totalCount: number, hasNextPage: boolean) {
		this.items = items;
		this.totalCount = totalCount;
		this.hasNextPage = hasNextPage;
	}
}

@InputType()
export class ViewInput {
	@Field()
	public internalId!: string;

	@Field()
	public name!: string;

	@Field()
	public sourceId: number;

	@Field()
	public languageId: number;

	@Field()
	public displayOrder!: number; 
}

@InputType()
export class ViewInternalIdsInput {
	@Field((_type) => [String])
	@ArrayMinSize(1, { message: "internalIds must have at minumum 1 element" })
	@ArrayMaxSize(25, { message: "internalIds must have at most 25 elements" })
	public internalIds: string[];
}

@InputType()
export class ViewAssociationInput {
	@Field((_type) => ID)
	public viewId!: number;

	@Field((_type) => [ViewNoteAssociationInput])
	public notes!: ViewNoteAssociationInput[];
}

@InputType()
export class ViewNoteAssociationInput {
	@Field((_type) => ID)
	public noteId!: number;

	@Field((_type) => Number)
	@IsPositive()
	public displayOrder!: number;
}

@InputType()
export class SearchViewsInput {
	@Field((_type) => [ID], { nullable: true })
	@ArrayMaxSize(10, { message: "sourceIds must have at most 10 elements" })
	@IsOptional()
	public sourceIds?: number[];

	@Field((_type) => [ID], { nullable: true })
	@ArrayMaxSize(10, { message: "languageIds must have at most 10 elements" })
	@IsOptional()
	public languageIds?: number[];
}
