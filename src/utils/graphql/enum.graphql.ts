import { registerEnumType } from "type-graphql";

export enum Sort {
	asc = "asc",
	desc = "desc",
}

export enum NoteSortField {
	date = "date",
	languageId = "languageId",
	sourceId = "sourceId",
}

registerEnumType(Sort, {
	name: "Sort",
	description: "Sorter for input search",
});

registerEnumType(NoteSortField, {
	name: "NoteSortField",
	description: "Possible values for sort in Note search",
});
