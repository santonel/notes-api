import type { GraphQLResolveInfo } from "graphql";
import { Arg, Ctx, Info, Query, Resolver } from "type-graphql";
import { Source, SourcesPaginated } from "../entities/source.entity";
import {
	PaginationInput,
	calcHasMorePages,
} from "../utils/graphql/pagination.graphql";
import type { CommonContext } from "../utils/interfaces/context.interface";

@Resolver((_of) => Source)
export class SourceResolver {
	@Query((_return) => SourcesPaginated, { description: "Get all languages" })
	public async getSources(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("paginationInput") paginationInput: PaginationInput,
	): Promise<SourcesPaginated> {
		const results = await ctx.em.findAndCount(
			Source,
			{},
			{
				limit: paginationInput.limit,
				offset: paginationInput.offset,
				orderBy: { id: "asc" },
			},
		);

		const sources = results[0];
		const totalCount = results[1];

		return new SourcesPaginated(
			sources,
			totalCount,
			calcHasMorePages(
				totalCount,
				paginationInput.limit,
				paginationInput.offset,
			),
		);
	}
}
