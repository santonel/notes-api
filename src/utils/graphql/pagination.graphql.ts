import { Max, Min } from "class-validator";
import { Field, InputType, Int } from "type-graphql";

@InputType()
export class PaginationInput {
	@Field(() => Int)
	@Min(1, { message: "Limit must be at least 1" })
	@Max(50, { message: "Limit cannot exceed 50" })
	public limit = 10;

	@Field(() => Int)
	@Min(0, { message: "Offset must be equal or greater than 0" })
	public offset = 0;
}

export function calcHasMorePages(
	totalCount: number,
	limit: number,
	offset: number,
): boolean {
	let totalPages: number = Math.floor(totalCount / limit);
	if (totalCount % limit !== 0) {
		totalPages++;
	}

	const currentPage: number = Math.floor(offset / limit) + 1;

	return currentPage < totalPages;
}
