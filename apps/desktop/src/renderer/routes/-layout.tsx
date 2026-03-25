import { Alerter } from "@superset/ui/atoms/Alert";
import type { ReactNode } from "react";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { AuthProvider } from "renderer/providers/AuthProvider";
import { ElectronTRPCProvider } from "renderer/providers/ElectronTRPCProvider";

export function RootLayout({ children }: { children: ReactNode }) {
	return (
		<ElectronTRPCProvider>
			<AuthProvider>
				{children}
				<ThemedToaster />
				<Alerter />
			</AuthProvider>
		</ElectronTRPCProvider>
	);
}
