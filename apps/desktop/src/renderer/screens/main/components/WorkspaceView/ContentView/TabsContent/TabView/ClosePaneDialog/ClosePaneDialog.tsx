import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";

interface ClosePaneDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	paneName: string;
	paneType: string;
}

const PANE_TYPE_LABELS: Record<string, string> = {
	terminal: "terminal",
	chat: "chat",
	webview: "browser",
	devtools: "devtools",
};

export function ClosePaneDialog({
	open,
	onOpenChange,
	onConfirm,
	paneName,
	paneType,
}: ClosePaneDialogProps) {
	const label = PANE_TYPE_LABELS[paneType] ?? "pane";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Close {label}?</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to close "{paneName}"? This action cannot be
						undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>Close</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
