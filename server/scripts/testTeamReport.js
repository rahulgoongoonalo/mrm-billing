// Sends the daily work report for each team member to one test recipient,
// always through Brevo's HTTP API (never SMTP). Same renderer as production.
//
//   node scripts/testTeamReport.js                       today, everyone, to rahul.goongoonalo@gmail.com
//   node scripts/testTeamReport.js someone@example.com 2026-09-30 Poonam Pallavi
//   node scripts/testTeamReport.js --preview 2026-09-30  write HTML files instead of sending
//   node scripts/testTeamReport.js --weekly someone@example.com 2026-10-01   the weekly tracker for the week holding that day

require('dotenv').config();
// The local resolver refuses SRV lookups on this machine; force Google DNS.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { brevoSendMail } = require('../services/emailService');
const {
  collectPersonDay, teamMembers, buildTeamReportHtml, teamReportSubject,
  collectWeek, buildWeeklyReportHtml, weeklyReportSubject, weekStartOf, addDays, todayIst,
} = require('../services/teamReport');
const { TEAM } = require('../services/teamReportNotification');

const args = process.argv.slice(2);
const weekly = args[0] === '--weekly';
if (weekly) args.shift();
const preview = args[0] === '--preview';
if (preview) args.shift();
const to = !preview && args[0] && args[0].includes('@') ? args.shift() : 'rahul.goongoonalo@gmail.com';
const date = args[0] && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) ? args.shift() : todayIst();
const only = args;

async function run() {
  try {
    if (!preview && !process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set');
    await mongoose.connect(process.env.MONGODB_URI);
    const people = await teamMembers(only.length ? only : TEAM);
    if (!people.length) throw new Error(`No team member matches ${only.join(', ')}`);

    if (weekly) {
      const weekStart = weekStartOf(date);
      const week = await collectWeek(people, weekStart);
      const prev = await collectWeek(people, addDays(weekStart, -7));
      const html = buildWeeklyReportHtml(week, prev, { isTest: true });
      const subject = weeklyReportSubject(week, { isTest: true });
      console.log(subject);
      if (preview) {
        const file = path.join(process.cwd(), `weekly-tracker-${weekStart}.html`);
        fs.writeFileSync(file, html);
        console.log(`  wrote ${file}`);
      } else {
        const res = await brevoSendMail({ from: process.env.EMAIL_FROM, to, subject, html });
        console.log(`  sent via Brevo to ${to} (${res.messageId || 'no id'})`);
      }
      return;
    }

    for (const user of people) {
      const d = await collectPersonDay(user, date);
      const html = buildTeamReportHtml(d, { isTest: true });
      const subject = teamReportSubject(d, { isTest: true });
      console.log(`${user.name}: ${subject}`);
      if (preview) {
        const file = path.join(process.cwd(), `team-report-${user.name}-${date}.html`);
        fs.writeFileSync(file, html);
        console.log(`  wrote ${file}`);
      } else {
        const res = await brevoSendMail({ from: process.env.EMAIL_FROM, to, subject, html });
        console.log(`  sent via Brevo to ${to} (${res.messageId || 'no id'})`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
