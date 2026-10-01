// Scheduled team mails: each person's own daily work report, and the weekly
// tracker for the managers.

const { getTransporter } = require('./emailService');
const {
  collectPersonDay, teamMembers, buildTeamReportHtml, teamReportSubject,
  collectWeek, buildWeeklyReportHtml, weeklyReportSubject, weekStartOf, addDays, isSunday, todayIst,
} = require('./teamReport');

// Whose day is reported, by app user name. Each gets their own report at the
// email they sign in with.
const TEAM = ['Poonam', 'Pallavi'];

const weeklyRecipients = 'sherley@musicrightsmanagementindia.com, devi@musicrightsmanagementindia.com';

async function sendDailyTeamReports(date = todayIst()) {
  try {
    const people = await teamMembers(TEAM);
    for (const user of people) {
      const d = await collectPersonDay(user, date);
      // Sunday is a day off: only report it if they worked.
      if (isSunday(date) && d.events === 0) continue;
      await getTransporter().sendMail({
        from: process.env.EMAIL_FROM,
        to: user.email,
        subject: teamReportSubject(d),
        html: buildTeamReportHtml(d),
      });
      console.log(`Daily work report sent to ${user.name} <${user.email}> for ${date}.`);
    }
  } catch (error) {
    console.error('Failed to send daily work reports:', error.message);
  }
}

// The week before the one holding `date` (run on Monday: last Monday to Sunday).
async function sendWeeklyTeamReport(date = todayIst()) {
  try {
    const people = await teamMembers(TEAM);
    const weekStart = addDays(weekStartOf(date), -7);
    const week = await collectWeek(people, weekStart);
    const prev = await collectWeek(people, addDays(weekStart, -7));
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: weeklyRecipients,
      subject: weeklyReportSubject(week),
      html: buildWeeklyReportHtml(week, prev),
    });
    console.log(`Weekly work tracker sent for the week from ${weekStart}.`);
  } catch (error) {
    console.error('Failed to send weekly work tracker:', error.message);
  }
}

module.exports = { sendDailyTeamReports, sendWeeklyTeamReport, TEAM, weeklyRecipients };
