const express = require("express");
const router = express.Router();

const db = require("../db");

console.log("✅ ESP32 route loaded");


router.get("/test",(req,res)=>{

    res.json({
        message:"ESP32 route working"
    });

});



router.post("/data",(req,res)=>{
    console.log("📩 ESP32 DATA RECEIVED");
    console.log(req.body);
    const data = req.body;


    const sql = `

    INSERT INTO monitoring_data
    (
    node_name,
    cpu_temperature,
    external_temperature,

    humidity,
    gas_level,
    gas_alarm,

    total_ram,
    free_ram,
    used_ram,
    minimum_free_ram,

    cpu_frequency,
    cpu_cores,
    active_core,

    wifi_signal,
    wifi_status,

    ip_address,
    gateway,
    subnet,
    dns,

    mac_address,
    hostname,

    chip_model,
    chip_revision,

    flash_size,
    sketch_size,
    free_sketch,

    sdk_version,

    uptime,
    reconnects,

    status

    )

    VALUES
    (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)

    `;



    const values=[

        data.node_name,
        data.cpu_temperature,
        data.external_temperature,


        data.humidity,
        data.gas_level,
        data.gas_alarm,


        data.total_ram,
        data.free_ram,
        data.used_ram,
        data.minimum_free_ram,


        data.cpu_frequency,
        data.cpu_cores,
        data.active_core,


        data.wifi_signal,
        data.wifi_status,


        data.ip_address,
        data.gateway,
        data.subnet,
        data.dns,


        data.mac_address,
        data.hostname,


        data.chip_model,
        data.chip_revision,


        data.flash_size,
        data.sketch_size,
        data.free_sketch,


        data.sdk_version,


        data.uptime,
        data.reconnects,


        data.status

    ];



    db.query(sql,values,(err,result)=>{


        if(err){

            console.log("❌ Database insert error");
            console.log(err.sqlMessage);
            console.log(err.sql);

            return res.status(500).json({
                error: err.sqlMessage
            });

        }


        console.log("✅ ESP32 data inserted");


        res.json({

            message:"Data inserted",
            id:result.insertId

        });


    });


});



module.exports = router;