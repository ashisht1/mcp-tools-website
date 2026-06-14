import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const emailTo = process.argv[2] || smtpUser || "tehri.ashish@gmail.com";
const subject = process.argv[3] || "Weekly MCP Update Report";
const htmlBody = process.argv[4] || "<h1>Weekly update completed</h1>";

async function main() {
  if (!smtpUser || !smtpPass) {
    console.error("Error: SMTP_USER and SMTP_PASS environment variables are required.");
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
  });

  const info = await transporter.sendMail({
    from: `"MCP Hub Automation" <${smtpUser}>`,
    to: emailTo,
    subject: subject,
    html: htmlBody
  });

  console.log("Email sent successfully. ID:", info.messageId);
}

main().catch(console.error);
