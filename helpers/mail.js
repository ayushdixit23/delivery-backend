const nodemailer = require("nodemailer");
require("dotenv").config()

const HOST = process.env.HOST
const USER = process.env.USER
const PASS = process.env.PASS

const transporter = nodemailer.createTransport({
	host: HOST,
	port: 587,
	secure: false, // upgrade later with STARTTLS
	auth: {
		user: USER,
		pass: PASS,
	},
});

const sendMailToUser = async (email, text) => {
	console.log(email)
	try {
		const mailOptions = {
			from: "grovyoinc@gmail.com",
			to: email,
			subject: "Your One-Time Password (OTP) for Secure Login",
			text: text,
		};

		await transporter.sendMail(mailOptions, (error, info) => {
			if (error) {
				return console.log("Error while sending email: ", error);
			}
			console.log("Message sent: %s", info.messageId);
			console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
		});

	} catch (error) {
		console.log(error)
	}
}

module.exports = { sendMailToUser }