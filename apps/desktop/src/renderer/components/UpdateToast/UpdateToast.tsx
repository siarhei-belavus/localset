import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { HiMiniXMark } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	AUTO_UPDATE_STATUS,
	LATEST_RELEASE_URL,
	RELEASES_URL,
} from "shared/auto-update";

interface UpdateToastProps {
	toastId: string | number;
	status: "available" | "downloading" | "ready" | "error";
	version?: string;
	error?: string;
	installMethod?: "auto" | "manual";
}

export function UpdateToast({
	toastId,
	status,
	version,
	error,
	installMethod,
}: UpdateToastProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const installMutation = electronTrpc.autoUpdate.install.useMutation();
	const dismissMutation = electronTrpc.autoUpdate.dismiss.useMutation({
		onSuccess: () => {
			toast.dismiss(toastId);
		},
	});

	const isAvailable = status === AUTO_UPDATE_STATUS.AVAILABLE;
	const isDownloading = status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isReady = status === AUTO_UPDATE_STATUS.READY;
	const isError = status === AUTO_UPDATE_STATUS.ERROR;
	const isManual = installMethod === "manual";

	const handleSeeChanges = () => {
		openUrl.mutate(RELEASES_URL);
	};

	const handleInstall = () => {
		installMutation.mutate();
	};

	const handleDownload = () => {
		openUrl.mutate(LATEST_RELEASE_URL);
	};

	const handleLater = () => {
		dismissMutation.mutate();
	};

	return (
		<div className="update-toast relative flex flex-col gap-3 bg-popover text-popover-foreground rounded-lg border border-border p-4 shadow-lg min-w-[340px]">
			<button
				type="button"
				onClick={handleLater}
				className="absolute top-2 right-2 size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
				aria-label="Dismiss"
			>
				<HiMiniXMark className="size-4" />
			</button>
			<div className="flex flex-col gap-0.5">
				{isError ? (
					<>
						<span className="font-medium text-sm text-destructive">
							Update failed
						</span>
						<span className="text-sm text-muted-foreground">
							{error || "Please try again later"}
						</span>
					</>
				) : isDownloading ? (
					<>
						<span className="font-medium text-sm">Downloading update...</span>
						<span className="text-sm text-muted-foreground">
							{version ? `Version ${version}` : "Please wait"}
						</span>
					</>
				) : isAvailable ? (
					<>
						<span className="font-medium text-sm">Update available</span>
						<span className="text-sm text-muted-foreground">
							{version
								? `Version ${version} is ready to download`
								: "A new version is available"}
						</span>
						<span className="text-xs text-muted-foreground/70">
							Unsigned macOS builds update manually from the latest release.
						</span>
					</>
				) : (
					<>
						<span className="font-medium text-sm">Update available</span>
						<span className="text-sm text-muted-foreground">
							{version
								? `Version ${version} is ready to install`
								: "Ready to install"}
						</span>
						<span className="text-xs text-muted-foreground/70">
							Your terminal sessions won't be interrupted.
						</span>
					</>
				)}
			</div>
			{(isReady || isAvailable) && (
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" onClick={handleSeeChanges}>
						See release
					</Button>
					{isManual ? (
						<Button size="sm" onClick={handleDownload}>
							Download latest
						</Button>
					) : (
						<Button
							size="sm"
							onClick={handleInstall}
							disabled={installMutation.isPending}
						>
							{installMutation.isPending ? "Installing..." : "Install"}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
