# Client Document Collection App — Product Vision

Oct 6, 2026 · @youssef

## The product in one sentence

A web app that lets small firms collect documents from their clients without chasing them, and keeps those documents safe and organized.

Pitch line: "Your clients send you everything you asked for, and you never chase them on WhatsApp again." Security is the reassurance underneath, not the headline.

**The problem it solves.** Accountants, lawyers, clinics, HR teams and real-estate agents collect sensitive documents every week: ID cards, payslips, contracts, bank statements. Today this happens over WhatsApp, email attachments and Drive links. That wastes hours chasing missing files, scatters documents across inboxes and phones, and creates legal risk under Morocco's Law 09-08 (and GDPR for European clients).

## Who it's for

First customer: **small accounting firms in Morocco** (fiduciaires and cabinets with 1–10 people). They collect the same documents from the same clients every year, chase constantly at tax season, and handle sensitive personal data. The owner can decide to buy alone, with no IT department.

Later, the same product with different templates: lawyers and notaries, HR teams, real-estate agencies, clinics. Then other French- and Arabic-speaking markets that large US tools ignore.

## How it works: Karim and Fatima

Karim is an accountant in Casablanca. It's tax season and he needs documents from 40 clients.

1. **Karim creates a request** for his client Fatima from a ready-made template, "Annual tax declaration": CIN, last 12 payslips, bank statements, rental contract. He adds or removes items and clicks send.
2. **Fatima gets a WhatsApp message or SMS** (email optional) in French or Arabic: "Cabinet Karim needs 4 documents from you. Click here to send them securely." No account, no app to install.
3. **On her phone, she sees a checklist** with a button per item: take a photo or choose a file. Each item turns green when it arrives. She can stop and come back later.
4. **The app chases for Karim.** Three days later Fatima gets a reminder listing what is still missing. Reminders continue until everything arrives or Karim stops them.
5. **Karim's dashboard shows all 40 clients at a glance:** who is complete, who is partial, who hasn't opened the link. Every document is already filed in an encrypted folder per client, on his own computer.
6. **Everything leaves a trace:** when the request was sent, opened, each file received, and who downloaded it. Karim can prove he handled the data properly.

Karim can also **send** files the other way, such as a finished tax return, through a secure link that expires.

## What makes it different

The edge is local fit and simplicity, not "secure WeTransfer." Tools built for client document collection already exist (for example Content Snare and FileInvite), which proves people pay for this, but they are English-first and not built for this market.

- **A ridiculously simple client side:** works on a cheap phone, in Arabic or French, with no account to create.
- **Reminders where people actually are:** WhatsApp and SMS, not only email.
- **Templates per profession:** a request takes 10 seconds to set up.
- **Built for the local market:** client files never stored on our servers, Law 09-08 compliance, local payment, local pricing.
- **Serious but invisible security:** files are encrypted on the client's phone and decrypted only on the firm's computer, with expiring links and an activity log. The app handles the keys.

## What it is not (at first)

Staying narrow is what lets one developer ship it. At first it is not a general file-sharing tool like Drive or WeTransfer, not accounting software, not an e-signature tool, and not a team collaboration platform. Mobile apps, integrations, team roles and e-signatures come only once firms are paying.

## Version 1

The smallest version worth showing to an accountant:

- [ ] Desktop app for the firm (Tauri): key pair on first launch, encrypted local vault per client, backup and recovery key
- [ ] Create a request from a template, send it by link (SMS, WhatsApp or email)
- [ ] Mobile-friendly client upload page with checklist, in French and Arabic
- [ ] Automatic reminders until the request is complete
- [ ] Dashboard of request status per client, files grouped by client
- [ ] Activity log (sent, opened, uploaded, downloaded)

Right after v1, once the first firms use it: subscription payments, the "send files" flow, and templates for other professions.

Open question: which payment provider works for a Moroccan business (Stripe may not support it; CMI is the local option).

## Where the files are stored

Files are end-to-end encrypted and live only on the firm's computer. The server is a blind mailbox: it cannot read anything and forgets each file once delivered.

&#91;embedded content: storage design · phone, blind relay, firm's vault\]

- **Why not pure peer to peer:** Fatima and Karim are rarely online at the same time, so something must hold the file in between.
- **The firm's desktop app (Tauri)** creates a key pair on first launch. The private key never leaves Karim's computer.
- **Fatima's browser encrypts each file** with Karim's public key, sent inside the request link, before upload. Use libsodium sealed boxes, no custom crypto.
- **The relay** holds only encrypted blobs with no names or file names, and deletes each one when Karim's app confirms receipt, or after 7 days.
- **Minimal server state:** random request IDs and checklist status, needed for reminders and the dashboard. Client names and phone numbers stay on Karim's computer.
- **On Karim's computer:** files are decrypted, virus-scanned and saved in an encrypted folder per client.
- **Backup and recovery:** an encrypted backup to a USB drive or second device, plus a printed recovery key, designed from day one.
- **Limits:** sharing one vault across a team is harder, so v1 targets solo firms or one shared office computer. Fatima's browser trusts the JavaScript the server sends, so never claim the system is impossible to breach.

## Vision, risks and next steps

**In 2–3 years:** the standard way professionals in Morocco and French/Arabic-speaking markets exchange documents with clients, with templates for every profession, integrations with local accounting software and a team plan. At that point it is also an acquisition target for accounting-software or legal-tech companies.

**Risks:**

- **Security:** one breach ends a product whose promise is safety. Use libsodium, no custom crypto, and get an experienced review of the design before real client data goes in. The biggest risk is a lost or broken laptop: without backup and a recovery key, the documents are gone.
- **Trust:** small firms need to believe the product will last. A clear privacy page and clear data location help.
- **"Good enough" habits:** some firms will keep using WhatsApp. Target those already worried about compliance.
- **Price:** €15–25/month works in Europe; Moroccan firms may expect less. The interviews decide this.

**Next steps:**

- [ ] Interview 10–15 accountants in Casablanca before writing code
- [ ] Test the core question: "If clients sent everything on time without you chasing, would that be worth 200–300 MAD a month?"
- [ ] Offer the first 5 firms free setup in exchange for feedback
- [ ] Build v1 only if several say chasing documents is a real pain
