import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function SlackIntegrationLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		notFound();
	}

	return <>{children}</>;
}
