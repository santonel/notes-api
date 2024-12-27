import type { BaseContext } from "@apollo/server";
import type { EntityManager } from "@mikro-orm/core";

export interface CommonContext extends BaseContext {
	em: EntityManager;
}
