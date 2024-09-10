const { Worker, Queue } = require('bullmq');
const User = require("../models/userAuth")
const Order = require("../models/orders")
const geolib = require("geolib");
const DriverLocation = require('../models/driverLocation');
const Deluser = require('../models/deluser');


function calculateTotalDistance(coordinates) {
	let totalDistance = 0;

	for (let i = 1; i < coordinates.length; i++) {
		const coord1 = coordinates[i - 1];
		const coord2 = coordinates[i];
		totalDistance += geolib.getDistance(coord1, coord2);
	}

	return totalDistance / 1000;
}


const findNearestDriver = async (user, storeids, coordinates) => {
	let partners = [];

	// const deliverypartners = await Deluser.find({
	// 	accounttype: "partner",
	// 	primaryloc: user.address.city,
	// });
	const deliveryCity = await DriverLocation.findOne({ "city.name": user.address.city.toLowerCase().trim() });

	if (deliveryCity) {
		console.log("we deliver in this city")

		let deliverypartners = []
		for (let i = 0; i < deliveryCity.city.deliverypartners; i++) {
			const delusers = await Deluser.findById(deliveryCity.city.deliverypartners[i])
			deliverypartners.push(delusers)
		}

		for (let deliverypartner of deliverypartners) {
			if (
				deliverypartner &&
				deliverypartner.accstatus !== "banned" &&
				deliverypartner.accstatus !== "review" &&
				deliverypartner.deliveries?.length < 21 &&
				deliverypartner.totalbalance < 3000
			) {
				let driverloc = {
					latitude: deliverypartner.currentlocation?.latitude,
					longitude: deliverypartner.currentlocation?.longitude,
					id: deliverypartner?._id,
				};
				partners.push(driverloc);
			}
		}

		return geolib.findNearest(coordinates[coordinates.length - 1], partners);

	} else {
		console.log("we dont deliver in this city")
		return null
	}
};


const worker = new Worker('delivery-assign', async (job) => {
	const { savedOrder, id, storeids, oid, total, instant } = job.data
	try {

		const user = await User.findById(id);
		const order = await Order.findById(savedOrder._id);
		let foodadmount = 7;
		let usualamount = 5;

		if (instant) {
			let coordinates = [];
			for (let storeid of storeids) {
				const mainstore = await User.findById(storeid);
				let stores = mainstore.storeAddress[0]
				const store = {
					streetaddress: stores?.buildingno,
					city: stores?.city,
					state: stores?.state,
					postal: stores.postal,
					landmark: stores?.landmark,
					coordinates: stores.coordinates
				}

				coordinates.push({
					latitude: store.coordinates.latitude,
					longitude: store.coordinates.longitude,
					address: store,
					id: mainstore._id,
				});
			}

			//sorting locations
			const sortedCoordinates = geolib.orderByDistance(
				{
					latitude: user.address.coordinates.latitude,
					longitude: user.address.coordinates.longitude,
				},
				coordinates
			);

			console.log(sortedCoordinates, "sortedCoordinates")

			const runCron = (cronJob) => {
				cron.schedule('0 * * * *', async () => {
					const eligiblepartner = await findNearestDriver(user, storeids, sortedCoordinates);
					if (eligiblepartner) {
						const driver = await Deluser?.findById(eligiblepartner?.id);

						const finalcoordinates = [
							{
								latitude: user.address.coordinates.latitude,
								longitude: user.address.coordinates.longitude,
							},
							...sortedCoordinates.map((coord) => ({
								latitude: coord.latitude,
								longitude: coord.longitude,
							})),
							{
								latitude: eligiblepartner.latitude,
								longitude: eligiblepartner.longitude,
							},
						];
						//total distance travelled
						const totalDistance = calculateTotalDistance(finalcoordinates);
						//earning of driver
						const earning = totalDistance * foodadmount;

						//markings
						let marks = [
							{
								latitude: eligiblepartner.latitude,
								longitude: eligiblepartner.longitude,
								done: true,
							},
						];

						for (let final of sortedCoordinates) {
							marks.push({
								latitude: final.latitude,
								longitude: final.longitude,
								done: false,
								address: final?.address,
							});
						}

						marks.push({
							latitude: user.address.coordinates.latitude,
							longitude: user.address.coordinates.longitude,
							done: false,
							address: user?.address,
						});

						const newDeliveries = new Delivery({
							title: user?.fullname,
							amount: total,
							orderId: oid,
							pickupaddress: sortedCoordinates[0].address,
							partner: driver?._id,
							droppingaddress: user?.address,
							phonenumber: user.phone,
							mode: order.paymentMode ? order?.paymentMode : "Cash",
							marks: marks,
							earning: earning > 150 ? 150 : earning,
							where: "customer",
							data: order.data,
						});
						await newDeliveries.save();

						//pushing delivery for driver
						await Deluser.updateOne(
							{ _id: driver._id },
							{ $push: { deliveries: newDeliveries._id } }
						);

						const msg = {
							notification: {
								title: "A new delivery has arrived.",
								body: `From ${user?.fullname} OrderId #${oid}`,
							},
							data: {},
							tokens: [
								driver?.notificationtoken,
								// user?.notificationtoken,
								// store?.notificationtoken, //person who selles this item
							],
						};

						await admin
							?.messaging()
							?.sendEachForMulticast(msg)
							.then((response) => {
								console.log("Successfully sent message");
							})
							.catch((error) => {
								console.log("Error sending message:", error);
							});

						cronJob.stop(); // Stop the cron job if partner is found
					} else {
						console.log('No drivers available yet. Checking again in an hour...');
					}
				});
			};

			let eligiblepartner = await findNearestDriver(user, storeids, sortedCoordinates);

			if (eligiblepartner) {
				const driver = await Deluser?.findById(eligiblepartner?.id);

				const finalcoordinates = [
					{
						latitude: user.address.coordinates.latitude,
						longitude: user.address.coordinates.longitude,
					},
					...sortedCoordinates.map((coord) => ({
						latitude: coord.latitude,
						longitude: coord.longitude,
					})),
					{
						latitude: eligiblepartner.latitude,
						longitude: eligiblepartner.longitude,
					},
				];
				//total distance travelled
				const totalDistance = calculateTotalDistance(finalcoordinates);
				//earning of driver
				const earning = totalDistance * foodadmount;

				//markings
				let marks = [
					{
						latitude: eligiblepartner.latitude,
						longitude: eligiblepartner.longitude,
						done: true,
					},
				];

				for (let final of sortedCoordinates) {
					marks.push({
						latitude: final.latitude,
						longitude: final.longitude,
						done: false,
						address: final?.address,
					});
				}

				marks.push({
					latitude: user.address.coordinates.latitude,
					longitude: user.address.coordinates.longitude,
					done: false,
					address: user?.address,
				});

				const newDeliveries = new Delivery({
					title: user?.fullname,
					amount: total,
					orderId: oid,
					pickupaddress: sortedCoordinates[0].address,
					partner: driver?._id,
					droppingaddress: user?.address,
					phonenumber: user.phone,
					mode: order.paymentMode ? order?.paymentMode : "Cash",
					marks: marks,
					earning: earning > 150 ? 150 : earning,
					where: "customer",
					data: order.data,
				});
				await newDeliveries.save();

				//pushing delivery for driver
				await Deluser.updateOne(
					{ _id: driver._id },
					{ $push: { deliveries: newDeliveries._id } }
				);

				const msg = {
					notification: {
						title: "A new delivery has arrived.",
						body: `From ${user?.fullname} OrderId #${oid}`,
					},
					data: {},
					tokens: [
						driver?.notificationtoken,
						// user?.notificationtoken,
						// store?.notificationtoken, //person who selles this item
					],
				};

				await admin
					?.messaging()
					?.sendEachForMulticast(msg)
					.then((response) => {
						console.log("Successfully sent message");
					})
					.catch((error) => {
						console.log("Error sending message:", error);
					});
				console.log("Booked Instant");
			} else {
				console.log("No drivers available at the moment!");
				runCron();
			}
		} else {
			//all stores
			let coordinates = [];
			for (let storeid of storeids) {
				const store = await User.findById(storeid);

				coordinates.push({
					latitude: store?.storeAddress[0]?.coordinates?.latitude,
					longitude: store?.storeAddress[0]?.coordinates?.longitude,
					address: store?.storeAddress[0],
					id: store._id,
				});
			}

			//checking if any store is more than 40kms away from customer

			let check;
			for (let store of coordinates) {
				check = geolib.isPointWithinRadius(
					{
						latitude: user?.address?.coordinates?.latitude,
						longitude: user?.address?.coordinates?.longitude,
					},
					{
						latitude: store?.latitude,
						longitude: store?.longitude,
					},
					40000
				);
			}

			if (!check) {
				//stores are away then first all items will go to affiliate

				//assign all the deliveries to all the partners
				let partners = [];

				const deliveryCity = await DriverLocation.findOne({ "city.name": user.address.city.toLowerCase().trim() });

				let deliverypartners = []
				for (let i = 0; i < deliveryCity.city.deliverypartners; i++) {
					const delusers = await Deluser.findById(deliveryCity.city.deliverypartners[i])
					deliverypartners.push(delusers)
				}

				for (let deliverypartner of deliverypartners) {
					if (
						deliverypartner &&
						deliverypartner.accstatus !== "banned" &&
						deliverypartner.accstatus !== "review" &&
						deliverypartner.deliveries?.length < 21 &&
						deliverypartner.totalbalance < 3000
					) {
						let driverloc = {
							latitude: deliverypartner.currentlocation?.latitude,
							longitude: deliverypartner.currentlocation?.longitude,
							id: deliverypartner?._id,
						};
						partners.push(driverloc);
					}
				}

				//finding an affiliate store near customer loc

				let storecoordinates = [];

				const affiliatestore = await Deluser.find({
					accounttype: "affiliate",
					primaryloc: user.address.city,
				});
				for (let store of affiliatestore) {
					storecoordinates.push({
						latitude: store.address.coordinates.latitude,
						longitude: store.address.coordinates.longitude,
						address: store.address,
						id: store._id,
					});
				}

				const neareststore = geolib.findNearest(
					{
						latitude: user?.address?.coordinates?.latitude,
						longitude: user?.address?.coordinates?.longitude,
					},
					storecoordinates
				);

				for (let storeid of storeids) {
					const seller = await User.findById(storeid);

					//finding delivery partner near seller
					let eligiblepartner = geolib.findNearest(
						{
							latitude: seller.storeAddress[0].coordinates.latitude,
							longitude: seller.storeAddress[0].coordinates.longitude,
						},
						partners
					);

					const driver = await Deluser?.findById(eligiblepartner?.id);

					//sorted locations
					const marks = [
						{
							latitude: eligiblepartner.latitude,
							longitude: eligiblepartner.longitude,
							done: true,
						},
						{
							latitude: seller.storeAddress[0].coordinates.latitude,
							longitude: seller.storeAddress[0].coordinates.longitude,
							done: false,
							address: seller?.storeAddress || seller?.storeAddress[0],
						},
						{
							latitude: neareststore.address.coordinates.latitude,
							longitude: neareststore.address.coordinates.longitude,
							done: false,
							address: neareststore?.address,
						},
					];

					const finalcoordinates = [
						{
							latitude: eligiblepartner.latitude,
							longitude: eligiblepartner.longitude,
						},
						{
							latitude: seller.storeAddress[0].coordinates.latitude,
							longitude: seller.storeAddress[0].coordinates.longitude,
						},
						{
							latitude: neareststore.address.coordinates.latitude,
							longitude: neareststore.address.coordinates.longitude,
						},
					];

					//total distance travelled
					const totalDistance = calculateTotalDistance(finalcoordinates);
					//earning of driver
					const earning = totalDistance * usualamount;

					const newDeliveries = new Delivery({
						title: user?.fullname,
						//amount: total,
						orderId: oid,
						pickupaddress: seller.address,
						partner: driver?._id,
						droppingaddress: neareststore.address,
						phonenumber: user.phone,
						//  mode: order.paymentMode ? order?.paymentMode : "Cash",
						marks: marks,
						earning: earning > 150 ? 150 : earning,
						where: "affiliate",
						data: order.data,
						affid: neareststore.id,
					});
					await newDeliveries.save();

					//pushing delivery for driver
					await Deluser.updateOne(
						{ _id: driver._id },
						{ $push: { deliveries: newDeliveries._id } }
					);

					//assiging to store for upcoming
					await Deluser.updateOne(
						{ _id: neareststore.id },
						{
							$push: {
								deliveries: newDeliveries._id,
								pickup: newDeliveries._id,
							},
						}
					);

					const msg = {
						notification: {
							title: "A new delivery has arrived.",
							body: `From ${user?.fullname} OrderId #${oid}`,
						},
						data: {},
						tokens: [
							driver?.notificationtoken,
							// user?.notificationtoken,
							// store?.notificationtoken, //person who selles this item
						],
					};

					await admin
						?.messaging()
						?.sendEachForMulticast(msg)
						.then((response) => {
							console.log("Successfully sent message");
						})
						.catch((error) => {
							console.log("Error sending message:", error);
						});
					console.log("Booked affiliate");
				}
			} else {
				//stores are near then usually deliver all items

				//sorting locations
				const sortedCoordinates = geolib.orderByDistance(
					{
						latitude: user.address.coordinates.latitude,
						longitude: user.address.coordinates.longitude,
					},
					coordinates
				);

				//finding the nearest driver from the last location
				let partners = [];

				// const deliverypartners = await Deluser.find({
				// 	accounttype: "partner",
				// 	primaryloc: user.address.city,
				// });

				const deliveryCity = await DriverLocation.findOne({ "city.name": user.address.city.toLowerCase().trim() });

				let deliverypartners = []
				for (let i = 0; i < deliveryCity.city.deliverypartners; i++) {
					const delusers = await Deluser.findById(deliveryCity.city.deliverypartners[i])
					deliverypartners.push(delusers)
				}


				for (let deliverypartner of deliverypartners) {
					if (
						deliverypartner &&
						deliverypartner.accstatus !== "banned" &&
						deliverypartner.accstatus !== "review" &&
						deliverypartner.deliveries?.length < 21 &&
						deliverypartner.totalbalance < 3000
					) {
						let driverloc = {
							latitude: deliverypartner.currentlocation?.latitude,
							longitude: deliverypartner.currentlocation?.longitude,
							id: deliverypartner?._id,
						};
						partners.push(driverloc);
					}
				}
				let eligiblepartner = geolib.findNearest(
					sortedCoordinates[sortedCoordinates.length - 1],
					partners
				);

				if (eligiblepartner) {
					//markings
					let marks = [
						{
							latitude: eligiblepartner.latitude,
							longitude: eligiblepartner.longitude,
							done: true,
						},
					];

					for (let final of sortedCoordinates) {
						marks.push({
							latitude: final.latitude,
							longitude: final.longitude,
							done: false,
							address: final?.address,
						});
					}

					marks.push({
						latitude: user.address.coordinates.latitude,
						longitude: user.address.coordinates.longitude,
						done: false,
						address: user?.address,
					});

					const driver = await Deluser?.findById(eligiblepartner?.id);

					const finalcoordinates = [
						{
							latitude: user.address.coordinates.latitude,
							longitude: user.address.coordinates.longitude,
						},
						...sortedCoordinates.map((coord) => ({
							latitude: coord.latitude,
							longitude: coord.longitude,
						})),
						{
							latitude: eligiblepartner.latitude,
							longitude: eligiblepartner.longitude,
						},
					];

					//total distance travelled
					const totalDistance = calculateTotalDistance(finalcoordinates);
					//earning of driver
					const earning = totalDistance * usualamount;

					const newDeliveries = new Delivery({
						title: user?.fullname,
						amount: total,
						orderId: oid,
						pickupaddress: sortedCoordinates[0].address,
						partner: driver?._id,
						droppingaddress: user?.address,
						phonenumber: user.phone,
						mode: order.paymentMode ? order?.paymentMode : "Cash",
						marks: marks,
						earning: earning > 150 ? 150 : earning,
						where: "customer",
						data: order.data,
					});
					await newDeliveries.save();

					//pushing delivery for driver
					await Deluser.updateOne(
						{ _id: driver._id },
						{ $push: { deliveries: newDeliveries._id } }
					);

					const msg = {
						notification: {
							title: "A new delivery has arrived.",
							body: `From ${user?.fullname} OrderId #${oid}`,
						},
						data: {},
						tokens: [
							driver?.notificationtoken,
							// user?.notificationtoken,
							// store?.notificationtoken, //person who selles this item
						],
					};

					await admin
						?.messaging()
						?.sendEachForMulticast(msg)
						.then((response) => {
							console.log("Successfully sent message");
						})
						.catch((error) => {
							console.log("Error sending message:", error);
						});
					console.log("Booked Usual");
				} else {
					console.log("Delivery Partner not available for usual");
				}
			}
		}
	} catch (error) {
		console.log(error)
	}
}, {
	connection: {
		host: "13.201.106.188",
		port: 6379,
		connectTimeout: 30000,
	},
});

console.log("worker connected")

worker.on('completed', (job) => {
	console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
	console.error(`Job ${job.id} failed with error ${err.message}`);
});

worker.on('error', (err) => {
	console.error('Worker error:', err);
});


// const addDeliveryJob = async (deliveryData) => {
// 	try {
// 		const job = await delivery.add('assign-delivery', deliveryData);
// 		console.log(`Added job ${job.id} to the queue`);
// 	} catch (error) {
// 		console.error('Error adding job to the queue:', error);
// 	}
// };

// addDeliveryJob({
// 	deliveryId: '1234',
// 	address: '123 Main St',
// 	city: 'Metropolis',
// 	state: 'NY',
// 	zip: '10001',

// });
