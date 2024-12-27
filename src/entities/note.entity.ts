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
	IsOptional,
	IsPositive,
	IsString,
	MinLength,
	Validate,
} from "class-validator";
import {
	Field,
	GraphQLISODateTime,
	ID,
	InputType,
	Int,
	ObjectType,
} from "type-graphql";
import { IsBeforeConstraint } from "../utils/graphql/validator.graphql";
import { Language } from "./language.entity";
import { Source } from "./source.entity";
import { Tag } from "./tag.entity";

@ObjectType()
@Entity()
export class Note {
	@Field((_type) => ID, { name: "noteId" })
	@PrimaryKey({ name: "note_id" })
	public id!: number;

	@Field()
	@Property({ name: "internal_id" })
	@Unique()
	public internalId!: string;

	@Field()
	@Property({ name: "title" })
	public title!: string;

	@Field()
	@Property({ name: "body" })
	public body!: string;

	@Field((_type) => Source)
	@ManyToOne({ entity: () => Source, joinColumn: "source_id" })
	public source: Source;

	@Field((_type) => Language)
	@ManyToOne({ entity: () => Language, joinColumn: "language_id" })
	public language: Language;

	@Field((_type) => [NoteTag])
	@OneToMany({ entity: () => NoteTag, mappedBy: "note" })
	public tags = new Collection<NoteTag>(this);

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "date" })
	public date: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "created_at", onCreate: () => new Date() })
	public createdAt?: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "updated_at", onUpdate: () => new Date() })
	public updatedAt?: Date = new Date();
}

@ObjectType()
@Entity()
export class NoteTag {
	@Field((_type) => ID, { name: "noteTagId" })
	@PrimaryKey({ name: "note_tag_id" })
	public id!: number;

	@Field((_type) => Note, { nullable: false })
	@ManyToOne(() => Note, { fieldName: "note_id" })
	public note!: Ref<Note>;

	@Field((_type) => Tag, { nullable: false })
	@ManyToOne(() => Tag, { fieldName: "tag_id" })
	public tag!: Ref<Tag>;

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "created_at", onCreate: () => new Date() })
	public createdAt?: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	@Property({ name: "updated_at", onUpdate: () => new Date() })
	public updatedAt?: Date = new Date();
}

@ObjectType()
export class NoteFlat {
	@Field((_type) => ID, { name: "noteId" })
	public id!: number;

	@Field()
	public internalId!: string;

	@Field()
	public title!: string;

	@Field()
	public body!: string;

	@Field((_type) => ID)
	public sourceId: number;

	@Field((_type) => ID)
	public languageId: number;

	@Field((_type) => GraphQLISODateTime)
	public date: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	public createdAt?: Date = new Date();

	@Field((_type) => GraphQLISODateTime)
	public updatedAt?: Date = new Date();

	constructor(note: Note) {
		this.id = note.id;
		this.internalId = note.internalId;
		this.title = note.title;
		this.body = note.body;
		this.sourceId = note.source.id;
		this.languageId = note.language.id;
		this.date = note.date;
		this.createdAt = note.createdAt;
		this.updatedAt = note.updatedAt;
	}
}

@ObjectType()
export class NotesPaginated {
	@Field((_type) => [Note])
	public items: Note[];

	@Field((_type) => Int)
	public totalCount: number;

	@Field()
	public hasNextPage: boolean;

	constructor(items: Note[], totalCount: number, hasNextPage: boolean) {
		this.items = items;
		this.totalCount = totalCount;
		this.hasNextPage = hasNextPage;
	}
}

@InputType()
export class SearchNotesInput {
	@Field((_type) => GraphQLISODateTime)
	@Validate(IsBeforeConstraint, ["toDate"])
	public fromDate!: Date;

	@Field((_type) => GraphQLISODateTime)
	public toDate!: Date;

	@Field((_type) => [ID], { nullable: true })
	@ArrayMaxSize(10, { message: "sourceIds must have at most 10 elements" })
	@IsOptional()
	public sourceIds?: number[];

	@Field((_type) => [ID], { nullable: true })
	@ArrayMaxSize(10, { message: "languageIds must have at most 10 elements" })
	@IsOptional()
	public languageIds?: number[];

	@Field((_type) => [ID], { nullable: true })
	@ArrayMaxSize(10, { message: "tagIds must have at most 10 elements" })
	@IsOptional()
	public tagIds?: number[];

	@Field((_type) => String, { nullable: true })
	@IsString({ message: "searchPhrase must be a string" })
	@MinLength(3, {
		message: "The searchPhrase must be at least 3 characters long",
	})
	@IsOptional()
	public searchPhrase?: string;
}

@InputType()
export class NoteInput {
	@Field()
	public internalId!: string;

	@Field()
	public title!: string;

	@Field()
	public body!: string;

	@Field()
	public sourceId: number;

	@Field()
	public languageId: number;

	@Field((_type) => GraphQLISODateTime)
	public date: Date = new Date();
}

@InputType()
export class NoteAssociationInput {
	@Field((_type) => ID)
	public noteId!: number;

	@Field((_type) => [NoteTagAssociationInput])
	public tags!: NoteTagAssociationInput[];
}

@InputType()
export class NoteTagAssociationInput {
	@Field((_type) => ID)
	public tagId!: number;

	@Field((_type) => Number)
	@IsPositive()
	public displayOrder!: number;
}

@InputType()
export class NoteDeleteIntervalInput {
	@Field((_type) => GraphQLISODateTime, { nullable: true })
	public fromDate?: Date;

	@Field((_type) => GraphQLISODateTime)
	public toDate!: Date;
}
