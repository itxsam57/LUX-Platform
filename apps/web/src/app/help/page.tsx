import Link from "next/link";
import type { Metadata } from "next";
import { PublicInfoPage, PublicInfoSection } from "@/components/public/public-info-page";

export const metadata: Metadata = { title: "Help | LUX Platform" };

export default function HelpPage() {
  return (
    <PublicInfoPage
      eyebrow="Public help"
      title="Help and support"
      intro="Use the route that matches what you need. LUX keeps account, privacy, project, funding, copyright, and operational issues inside their authorized workflows."
    >
      <PublicInfoSection title="Account and privacy">
        <p>Sign in to manage profile, verification, privacy, security, export, and deletion-request controls. If access is denied, return to the workspace selector and choose a role that your account has actually been granted.</p>
      </PublicInfoSection>
      <PublicInfoSection title="Funding, production, and releases">
        <p>Supporters can review their own funding records and released library items. Creators and authorized collaborators can use their project workspace for production, review, final-cut, release, earnings, and payout state.</p>
      </PublicInfoSection>
      <PublicInfoSection title="Copyright or safety concern">
        <p>Signed-in users can use the copyright and support workflows available to their role. Staff escalation queues preserve audit history and restrict evidence to authorized reviewers.</p>
        <p><Link href="/app/support">Open the support, report, dispute, and appeal center</Link></p>
      </PublicInfoSection>
      <PublicInfoSection title="Start here">
        <div className="component-row">
          <Link href="/auth/login">Sign in</Link>
          <Link href="/auth/sign-up">Create account</Link>
        </div>
      </PublicInfoSection>
    </PublicInfoPage>
  );
}
