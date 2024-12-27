import type { GraphQLResolveInfo } from "graphql";
import { Arg, Ctx, Info, Query, Resolver } from "type-graphql";
import { Tag, TagsPaginated } from "../entities/tag.entity";
import {
	PaginationInput,
	calcHasMorePages,
} from "../utils/graphql/pagination.graphql";
import type { CommonContext } from "../utils/interfaces/context.interface";

@Resolver((_of) => Tag)
export class TagResolver {
	@Query((_return) => TagsPaginated, { description: "Get all tags" })
	public async getTags(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("paginationInput") paginationInput: PaginationInput,
	): Promise<TagsPaginated> {
		const results = await ctx.em.findAndCount(
			Tag,
			{},
			{ limit: paginationInput.limit, offset: paginationInput.offset },
		);

		const tags = results[0];
		const totalCount = results[1];

		return new TagsPaginated(
			tags,
			totalCount,
			calcHasMorePages(
				totalCount,
				paginationInput.limit,
				paginationInput.offset,
			),
		);
	}
}
