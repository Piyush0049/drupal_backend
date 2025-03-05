const nodemailer = require("nodemailer")

exports.sendMail = async ({ email, subject, message }) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });

        const mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: subject,
            text: message,
            html: `<p>${message}</p>`,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent to: ${email} with subject: ${subject}`);
    } catch (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to send email, please try again later.",
        });
    }
    
};
