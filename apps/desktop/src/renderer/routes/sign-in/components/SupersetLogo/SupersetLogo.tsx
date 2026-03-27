import { cn } from "@superset/ui/utils";
import { useId } from "react";
import { DESKTOP_DISTRIBUTION } from "shared/desktop-distribution";

interface SupersetLogoProps {
	className?: string;
}

export function SupersetLogo({ className }: SupersetLogoProps) {
	const logoId = useId().replace(/:/g, "");
	const gradientId = `${logoId}-gradient`;
	const shimmerId = `${logoId}-shimmer`;
	const glowId = `${logoId}-glow`;

	return (
		<svg
			width="340"
			height="56"
			viewBox="0 0 340 56"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("overflow-visible", className)}
			aria-label={DESKTOP_DISTRIBUTION.productName}
			role="img"
		>
			<title>{DESKTOP_DISTRIBUTION.productName}</title>
			<defs>
				<linearGradient
					id={gradientId}
					x1="0%"
					y1="0%"
					x2="100%"
					y2="0%"
					gradientUnits="objectBoundingBox"
				>
					<stop offset="0%" stopColor="#ff5ea9" />
					<stop offset="18%" stopColor="#ff9f43" />
					<stop offset="36%" stopColor="#ffd166" />
					<stop offset="54%" stopColor="#5be7a9" />
					<stop offset="72%" stopColor="#5fb0ff" />
					<stop offset="90%" stopColor="#b07cff" />
					<stop offset="100%" stopColor="#ff5ea9" />
					<animateTransform
						attributeName="gradientTransform"
						type="translate"
						values="-0.8 0;0.8 0;-0.8 0"
						dur="5s"
						repeatCount="indefinite"
					/>
				</linearGradient>

				<linearGradient
					id={shimmerId}
					x1="0%"
					y1="0%"
					x2="100%"
					y2="0%"
					gradientUnits="objectBoundingBox"
				>
					<stop offset="0%" stopColor="rgba(255,255,255,0)" />
					<stop offset="45%" stopColor="rgba(255,255,255,0)" />
					<stop offset="50%" stopColor="rgba(255,255,255,0.95)" />
					<stop offset="55%" stopColor="rgba(255,255,255,0)" />
					<stop offset="100%" stopColor="rgba(255,255,255,0)" />
					<animateTransform
						attributeName="gradientTransform"
						type="translate"
						values="-1.2 0;1.2 0"
						dur="2.8s"
						repeatCount="indefinite"
					/>
				</linearGradient>

				<filter
					id={glowId}
					x="-20%"
					y="-60%"
					width="140%"
					height="220%"
					colorInterpolationFilters="sRGB"
				>
					<feGaussianBlur stdDeviation="2.8" result="blur" />
					<feColorMatrix
						in="blur"
						type="matrix"
						values="1 0 0 0 0
										0 1 0 0 0
										0 0 1 0 0
										0 0 0 0.5 0"
						result="glow"
					/>
					<feMerge>
						<feMergeNode in="glow" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>

			<g filter={`url(#${glowId})`}>
				<text
					x="50%"
					y="50%"
					textAnchor="middle"
					dominantBaseline="middle"
					fill={`url(#${gradientId})`}
					fontSize="34"
					fontWeight="900"
					letterSpacing="0.18em"
					style={{
						fontFamily:
							'"SF Mono", "IBM Plex Mono", "JetBrains Mono", Menlo, monospace',
					}}
				>
					LOCALSET
				</text>

				<text
					x="50%"
					y="50%"
					textAnchor="middle"
					dominantBaseline="middle"
					fill={`url(#${shimmerId})`}
					fontSize="34"
					fontWeight="900"
					letterSpacing="0.18em"
					style={{
						fontFamily:
							'"SF Mono", "IBM Plex Mono", "JetBrains Mono", Menlo, monospace',
						mixBlendMode: "screen",
					}}
				>
					LOCALSET
				</text>
			</g>
		</svg>
	);
}
