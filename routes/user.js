const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const {
  usercheck,
  usersignup,
  userlogout,
  approvestore,
  getinitaldata,
  approveid,
  changeactive,
  updateuser,
  deliverystatus,
  verifypic,
  requestpayout,
  deliveryImageUpload,
  deliveryotpverify,
  deliverySellerImageUpload,
  deliverySellerotpverify,
} = require("../controllers/user");

//signup or login user check
router.post("/usercheck", usercheck);

//signup user
router.post("/usersignup", upload.any(), usersignup);

//getinitaldata
router.get("/getinitaldata/:id", getinitaldata);

//approve delivery partner id
router.post("/approveid/:id", approveid);

//changeactive status
router.post("/changeactive/:id", changeactive);

//approve a store
router.post("/approvestore/:id", approvestore);

//logout user
router.post("/userlogout/:id", userlogout);

//updateuser profile
router.post("/updateuser/:id", upload.any(), updateuser);

//delivery status
router.get("/deliverystatus/:id", deliverystatus);

//delivery status
router.post("/verifypic/:id/:dev/:mark", upload.single("image"), verifypic);

//raise a withdrawl request
router.post("/requestpayout/:id", requestpayout);

router.post("/deliveryImageUpload/:id", upload.any(), deliveryImageUpload);
router.post("/deliveryotpverify/:id/:orderId/:deliveryId", deliveryotpverify);
router.post("/deliverysellerImageUpload/:id", upload.any(), deliverySellerImageUpload);
router.post("/deliverysellerotpverify/:id", deliverySellerotpverify);

module.exports = router;
