import { SUPPORT_EMAIL, type PolicySection } from './photoPolicy';

/**
 * Terms of Service, Privacy Policy and Community Guidelines: agreed to on account creation.
 *
 * DRAFTS FOR LEGAL REVIEW. These are written in plain language to match how the app works today,
 * but they are not legal advice. Before launch:
 *  - replace LEGAL_ENTITY, GOVERNING_LAW and the contact addresses with the real ones;
 *  - have a lawyer review all three (especially liability, arbitration and state privacy laws);
 *  - bump LEGAL_VERSION whenever a change needs people to agree again.
 */

/** Bump when a change needs everyone to agree again (the server stores the version accepted). */
export const LEGAL_VERSION = '2026-10-19';
export const LEGAL_UPDATED = 'October 19, 2026';

/** Placeholder: the registered company name, e.g. "Call Sign Solutions LLC". */
export const LEGAL_ENTITY = 'Call Sign Solutions';
/** Placeholder: whose laws govern the Terms, e.g. "the State of Colorado". */
export const GOVERNING_LAW = '[STATE]';
/** Placeholder: replace with the real privacy contact before release. */
export const PRIVACY_EMAIL = 'privacy@proxipoint.app';

/** Youngest age that can make an account. */
export const MINIMUM_AGE = 18;

export type LegalDocId = 'terms' | 'privacy' | 'guidelines';

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  /** One line under the title. */
  intro: string;
  sections: PolicySection[];
}

const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Terms of Service',
  intro: `These terms are an agreement between you and ${LEGAL_ENTITY} (“we”, “us”), which makes ProxiPoint. By creating an account or using ProxiPoint, you agree to them.`,
  sections: [
    {
      title: 'Who can use ProxiPoint',
      points: [
        `You must be at least ${MINIMUM_AGE} years old.`,
        'You need to give a real email address and keep your account details accurate.',
        'One person per account. Don’t share your login or use someone else’s account.',
        'You can’t use ProxiPoint if we’ve banned you, or if the law where you live doesn’t allow it.',
      ],
    },
    {
      title: 'Your account',
      points: [
        'You’re responsible for what happens on your account. Keep your password private and tell us if you think someone else has used it.',
        'Your @handle must not impersonate anyone or mislead people about who you are.',
        'You can stop using ProxiPoint and delete your account at any time.',
      ],
    },
    {
      title: 'What you post',
      points: [
        'You own what you post: Points, posts, comments, photos, recaps and your profile.',
        'You give us a worldwide, non-exclusive, royalty-free license to host, store, show, copy and share it so ProxiPoint can work (for example, showing your Point to people nearby). The license ends when you delete the content or your account, except where it has been shared by others or we must keep it by law.',
        'Only post things you have the right to share, and follow the Community Guidelines and Photo rules.',
        'We may remove content or limit accounts that break these terms or the guidelines, or that put people at risk.',
      ],
    },
    {
      title: 'Points, meetups and places',
      points: [
        'Points are created by users, not by us. We don’t check, host, supervise or guarantee any event, place or person.',
        'You choose whether to go to an event or meet someone, and you do so at your own risk. Meet in public, tell someone where you’re going and use your judgment.',
        'Hosts are responsible for their events, including permits, safety, age limits and following local law.',
        'Times, places, “Live now”, “Still happening?” and other details come from people and can be wrong.',
      ],
    },
    {
      title: 'Businesses and Boosts',
      points: [
        'Businesses can pay to Boost a Point so more people see it. Boosted Points are always labeled.',
        'Paying for a Boost buys visibility only. It never changes rankings, Signal Score or search order.',
        'Boosts follow the price and terms shown when you buy them. Unless the law says otherwise, a Boost that has started running isn’t refundable.',
      ],
    },
    {
      title: 'Signal Score',
      points: [
        'Signal Score reflects how people respond to what you share. It has no cash value and can’t be bought, sold or transferred.',
        'We may change how it’s calculated, and reset scores that were gamed.',
      ],
    },
    {
      title: 'Things you must not do',
      points: [
        'Break the law, or help someone else break it.',
        'Harass, threaten, stalk or track anyone, or share someone’s location or private details without their permission.',
        'Post fake events, spam, scams or misleading information.',
        'Scrape, copy or collect data from ProxiPoint in bulk, or use bots and fake accounts.',
        'Interfere with ProxiPoint, try to get into accounts or systems you’re not allowed in, or get around a ban or block.',
      ],
    },
    {
      title: 'Ending your account',
      points: [
        'You can delete your account at any time.',
        'We may suspend or close accounts that break these terms or the Community Guidelines, or when the law requires it. Where we can, we’ll tell you why.',
      ],
    },
    {
      title: 'Disclaimers',
      points: [
        'ProxiPoint is provided “as is”. We work to keep it running and accurate but can’t promise it will always be available, error-free or secure.',
        'We aren’t responsible for what other users post or do, on ProxiPoint or in person.',
      ],
    },
    {
      title: 'Limits on our liability',
      points: [
        `To the extent the law allows, ${LEGAL_ENTITY} isn’t liable for indirect, incidental or consequential damages, or for loss of data, profits or goodwill, from your use of ProxiPoint or events you find through it.`,
        'To the extent the law allows, our total liability for any claim is limited to the greater of what you paid us in the 12 months before the claim, or $100.',
        'Some places don’t allow these limits, so they may not all apply to you.',
      ],
    },
    {
      title: 'Changes and the law',
      points: [
        'We may update these terms. If a change matters, we’ll tell you in the app and may ask you to agree again before you continue.',
        `These terms are governed by the laws of ${GOVERNING_LAW}, without regard to conflict-of-law rules.`,
        `Questions: ${SUPPORT_EMAIL}`,
      ],
    },
  ],
};

const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  intro: `How ${LEGAL_ENTITY} collects, uses and shares information when you use ProxiPoint, and the choices you have.`,
  sections: [
    {
      title: 'What you give us',
      points: [
        'Account details: email address and password (we store only a scrambled hash of the password, never the password itself).',
        'Profile: name, @handle, photo, banner, bio, #interests and home city.',
        'What you post: Points, posts, comments, reactions, recaps, photos, RSVPs and channel memberships.',
        'Reports, blocks and messages you send to support.',
      ],
    },
    {
      title: 'Location',
      points: [
        'Your home city, if you set one, decides where Discover opens.',
        'With “Follow my location” on, the app uses your phone’s location to show what’s around you. That location is used for the map and isn’t shown to other people.',
        'Points and posts you pin to a place show that place. With Location privacy on, others see only the area you chose.',
        'Proximity alerts and live tracking, only if you turn them on: your phone sends its location to our servers, including in the background, while they’re on. A notification shows while this is running, and you can turn it off at any time.',
        'Interest counts (“20+ people into #Hiking nearby”) include you only if you opt in. They use a rough ~1 km area around your home, never your exact location, and small numbers are never shown.',
        'Photos have hidden GPS data removed when they’re uploaded.',
      ],
    },
    {
      title: 'Collected automatically',
      points: [
        'Device and app details: device type, operating system, app version, language and crash reports.',
        'Usage: what you view, tap and search, so we can improve ProxiPoint and keep it safe.',
        'Network details such as IP address, used for security and to stop abuse.',
      ],
    },
    {
      title: 'How we use it',
      points: [
        'To run ProxiPoint: show nearby Points, channels and posts, send the notifications you’ve chosen, and let people find you by @handle.',
        'To keep people safe: review reports, catch spam and abuse, and enforce the guidelines.',
        'To understand and improve the app, using aggregated or de-identified data where we can.',
        'To communicate with you about your account, security and changes to these policies.',
      ],
    },
    {
      title: 'Who we share it with',
      points: [
        'Other users see what you make public: your profile, posts, Points, reactions and anything in public channels. Private channels are visible only to approved members.',
        'Service providers who run ProxiPoint for us, such as cloud hosting, storage, analytics, email and map providers, under contracts that limit how they use it.',
        'Law enforcement or others when the law requires it, or to protect someone from serious harm.',
        'A buyer or successor if the business is sold or merged, under this policy.',
        'We do not sell your personal information, and we don’t share it for cross-site advertising.',
      ],
    },
    {
      title: 'How long we keep it',
      points: [
        'We keep your information while your account is open.',
        'When you delete your account, we delete or de-identify your information within 30 days, except what we must keep for legal, safety or fraud reasons, and backups that expire on their own.',
        'Live location from proximity tracking is kept only as long as needed for alerts, then deleted or aggregated.',
      ],
    },
    {
      title: 'Your choices',
      points: [
        'Change your profile, privacy and notification settings in Settings at any time.',
        'Turn location off in Settings or in your phone’s settings. Discover then uses your home city.',
        `Ask for a copy of your information, or ask us to correct or delete it, at ${PRIVACY_EMAIL}. Depending on where you live, you may have more rights; we’ll honor them as the law requires.`,
      ],
    },
    {
      title: 'Security, age and changes',
      points: [
        'We use encryption in transit, hashed passwords and access controls, but no system is perfectly secure.',
        `ProxiPoint is for people ${MINIMUM_AGE} and older. If we learn we have information from someone younger, we delete it.`,
        'We’ll tell you in the app before significant changes to this policy take effect.',
        `Questions: ${PRIVACY_EMAIL}`,
      ],
    },
  ],
};

const GUIDELINES: LegalDoc = {
  id: 'guidelines',
  title: 'Community Guidelines',
  intro: 'ProxiPoint is your neighborhood, on a map. These guidelines keep it useful, local and safe. They apply to everything you post and to how you treat people you meet through ProxiPoint.',
  sections: [
    {
      title: 'Be real and local',
      points: [
        'Post real events, real places and things that are actually happening.',
        'Keep heads-ups and tips honest. If something has ended or changed, say so.',
        'Use your own identity. Don’t impersonate people, businesses or organizations.',
      ],
    },
    {
      title: 'Respect people',
      points: [
        'No harassment, bullying, threats or intimidation.',
        'No hate speech or attacks based on race, ethnicity, national origin, religion, gender, gender identity, sexual orientation, disability, age or serious illness.',
        'Disagree with ideas, not people. Keep it civil in replies and channels.',
      ],
    },
    {
      title: 'Protect privacy and location',
      points: [
        'Never share someone else’s home address, live location, phone number or private details without their permission.',
        'Don’t use ProxiPoint to follow, track or show up on someone who doesn’t want that.',
        'Ask before posting photos of people, and ask a parent before posting kids.',
      ],
    },
    {
      title: 'Keep meetups safe',
      points: [
        'Host in public, accessible places, and describe your event honestly, including costs, age limits and alcohol.',
        'Kid Friendly means kid friendly: no alcohol focus, adult content or unsafe activities.',
        'Don’t organize anything illegal or dangerous. If someone is in danger, contact local emergency services first.',
      ],
    },
    {
      title: 'Not allowed anywhere',
      points: [
        'Content that sexualizes or endangers minors. We remove it, ban the account and report it to authorities.',
        'Nudity, sexual content, graphic violence or content promoting self-harm.',
        'Selling illegal goods, drugs or weapons.',
        'Scams, spam, fake events or misleading links.',
      ],
    },
    {
      title: 'Businesses',
      points: [
        'Businesses are welcome. Post real offers and events, and use Boosts to reach more people.',
        'Boosts are always labeled. Businesses pay to be seen, never to be ranked.',
        'Don’t pose as a regular user to promote your business, or post fake reviews or reactions.',
      ],
    },
    {
      title: 'Play fair',
      points: [
        'Don’t use extra accounts, bots or coordinated likes to inflate Signal Score or reactions.',
        'Channel moderators: apply your channel’s rules fairly and don’t use moderator tools to harass.',
      ],
    },
    {
      title: 'Reporting and what happens',
      points: [
        'Use Report on any Point, post, comment, photo or profile. Reported content is hidden for you right away and reviewed.',
        'Block anyone to stop seeing them.',
        'Breaking the guidelines can lead to removed content, limits on posting, or a suspended or banned account. Serious harm or illegal activity can lead to an immediate ban and a report to law enforcement.',
        `Questions or appeals: ${SUPPORT_EMAIL}`,
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: TERMS,
  privacy: PRIVACY,
  guidelines: GUIDELINES,
};
