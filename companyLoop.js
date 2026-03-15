const cron = require("node-cron")
const { createNewProject } = require("./ceoBrain")

async function companyCycle(){

console.log("Jordan CEO cycle starting")

await createNewProject()

}

cron.schedule("0 */12 * * *", async () => {

await companyCycle()

})