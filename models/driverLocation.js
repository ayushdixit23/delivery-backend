const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;

const driverLocation = new mongoose.Schema({
	city: {
		name: { type: String },
		deliverypartners: [{
			type: ObjectId, ref: "DelUser"
		}]
	}
});

module.exports = mongoose.model("DriverLocation", driverLocation);
