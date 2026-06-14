import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { email, message, screenshot } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message field is required' });
    }

    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      console.error("Error: SMTP_USER or SMTP_PASS environment variables are missing.");
      return res.status(500).json({ error: "SMTP configuration is incomplete on the server." });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const attachments = [];
    if (screenshot && screenshot.startsWith('data:')) {
      const matches = screenshot.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const type = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const extension = type.split('/')[1] || 'png';
        
        attachments.push({
          filename: `screenshot.${extension}`,
          content: buffer,
          contentType: type
        });
      }
    }

    const mailOptions = {
      from: `"MCP Hub Feedback" <${smtpUser}>`,
      to: process.env.FEEDBACK_RECIPIENT || smtpUser || "tehri.ashish@gmail.com",
      subject: `[mcptools.dev] New User Feedback`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 8px; padding: 24px;">
          <h2 style="color: #0ea5e9; border-bottom: 2px solid #e4e4e7; padding-bottom: 8px; margin-top: 0;">New Site Feedback</h2>
          <p><strong>From Email:</strong> ${email ? `<a href="mailto:${email}">${email}</a>` : 'Anonymous'}</p>
          <p><strong>Date Received:</strong> ${new Date().toLocaleString()}</p>
          <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 16px 0;" />
          <p><strong>Feedback Message:</strong></p>
          <div style="background-color: #f4f4f5; border-radius: 6px; padding: 16px; font-family: monospace; white-space: pre-wrap; font-size: 0.95rem; border-left: 4px solid #71717a;">${escapeHTML(message)}</div>
          ${screenshot ? `<p style="margin-top: 16px; font-style: italic; color: #71717a;">🖼️ A screenshot was attached to this feedback and is enclosed with this email.</p>` : ''}
        </div>
      `,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Feedback email sent: %s", info.messageId);

    return res.status(200).json({ success: true, message: "Feedback sent successfully!" });
  } catch (error) {
    console.error("Error in feedback handler:", error);
    return res.status(500).json({ error: "Failed to send feedback email.", details: error.message });
  }
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
