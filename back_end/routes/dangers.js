const express = require("express");
const router = express.Router();

const db = require("../db");


// Get danger history
router.get("/dangers", (req,res)=>{


    const sql = `

    SELECT *

    FROM danger_history

    ORDER BY id DESC

    LIMIT 50

    `;


    db.query(sql,(err,result)=>{


        if(err){

            console.log("Danger history error:");
            console.log(err);

            return res.status(500).json({
                error:"Database error"
            });

        }


        res.json(result);


    });


});


module.exports = router;