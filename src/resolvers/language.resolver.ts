import type { GraphQLResolveInfo } from "graphql";
import { Arg, Ctx, Info, Query, Resolver } from "type-graphql";
import { Language, LanguagesPaginated } from "../entities/language.entity";
import {
	PaginationInput,
	calcHasMorePages,
} from "../utils/graphql/pagination.graphql";
import type { CommonContext } from "../utils/interfaces/context.interface";

@Resolver((_of) => Language)
export class LanguageResolver {
	@Query((_return) => LanguagesPaginated, { description: "Get all languages" })
	public async getLanguages(
		@Ctx() ctx: CommonContext,
		@Info() info: GraphQLResolveInfo,
		@Arg("paginationInput") paginationInput: PaginationInput,
	): Promise<LanguagesPaginated> {
		const results = await ctx.em.findAndCount(
			Language,
			{},
			{ limit: paginationInput.limit, offset: paginationInput.offset },
		);

		const languages = results[0];
		const totalCount = results[1];

		return new LanguagesPaginated(
			languages,
			totalCount,
			calcHasMorePages(
				totalCount,
				paginationInput.limit,
				paginationInput.offset,
			),
		);
	}
}
