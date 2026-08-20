const express = require("express");
const router = express.Router();

const db = require("../db");
const requireAuth = require("../middleware/auth");
console.log("✅ Network route loaded");


router.get("/network", requireAuth, (req,res)=>{


const sql = `

SELECT

wifi_signal,
wifi_status,

ip_address,
gateway,
subnet,
dns,

mac_address,
hostname

FROM monitoring_data

ORDER BY id DESC

LIMIT 1

`;



db.query(sql,(err,result)=>{


if(err){

console.log(err);

return res.status(500).json({
error:"Database error"
});

}


res.json(result[0]);


});


});


module.exports = router;