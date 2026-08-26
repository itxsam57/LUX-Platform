import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./auth-workspace.css";
import "./profile-privacy.css";
import "./discovery.css";
import "./verification.css";
import "./demand.css";
import "./studio.css";
import "./contracts.css";

export const metadata: Metadata = { title: "LUX Platform", description: "Crowd-demanded, creator-controlled productions." };
export default function RootLayout({children}:Readonly<{children:ReactNode}>){return <html lang="en"><body>{children}</body></html>}
