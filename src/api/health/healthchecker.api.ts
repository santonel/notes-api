import type { EntityManager } from "@mikro-orm/core";
import type { Request, Response } from "express";

export default async function healthChecker(
	req: Request,
	res: Response,
	em: EntityManager,
): Promise<void> {
	const isDbConnected: boolean = await em.getConnection().isConnected();

	const healthcheck = {
		uptime: process.uptime(),
		message: "OK",
		timestamp: new Date().getTime(),
		dbConnected: isDbConnected,
	};
	try {
		res.send(healthcheck);
	} catch (e: unknown) {
		if (e instanceof Error) {
			healthcheck.message = e.message;
		}
		res.status(503).send();
	}
}
