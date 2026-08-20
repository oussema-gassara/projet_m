const express = require("express");
const router = express.Router();

console.log("✅ Sensors route loaded");

const db = require("../db");


router.get("/sensors",(req,res)=>{


const sql = `

SELECT

external_temperature,
humidity,
gas_level,
gas_alarm,
status,
created_at

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