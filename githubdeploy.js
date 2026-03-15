const { exec } = require("child_process")

function deploySite(){

exec("git add .", (err)=>{
if(err) return console.log(err)

exec('git commit -m "Jordan AI website update"', (err)=>{
if(err) console.log("Nothing to commit")

exec("git push", (err,stdout,stderr)=>{

if(err){
console.log("Deploy error:",err)
}else{
console.log("Website deployed to GitHub")
}

})

})

})

}

module.exports = { deploySite }