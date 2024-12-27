import { Field, InputType } from "type-graphql";
import { NoteSortField, Sort } from "./enum.graphql";

@InputType()
export class NoteSortInput {
	@Field((_type) => NoteSortField)
	public field!: NoteSortField;

	@Field((_type) => Sort)
	public sort!: Sort;
}

@InputType()
export class NoteMultiSortInput {
	@Field((_type) => [NoteSortInput])
	public sorts: NoteSortInput[];
}
