'use strict';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL;
//new text
// Imports dependencies and set up http server
const 
    { uuid } = require('uuidv4'), 
    { format } = require('util'),
    request = require('request'),
    express = require('express'),
    body_parser = require('body-parser'),
    firebase = require("firebase-admin"),
    ejs = require("ejs"),
    fs = require('fs'),
    multer = require('multer'),
    app = express();

const uuidv4 = uuid();
const session = require('express-session');
app.use(body_parser.json());
app.use(body_parser.urlencoded());
app.set('trust proxy', 1);
app.use(session({secret: 'effystonem'}));
app.use(express.static(__dirname + '/public'));

const buyer_bot_questions = {
    "q1": "Which day do you want to see? (dd-mm-yyyy)",
    "q2": "Choose Time. (PS :You can viewd within 9:00 to 17:00.) (hh:mm)",
    "q3": "Please enter full name",
    "q4": "Would you like to leave a phone number",
    "q5": "Where do you want to look the car? PS : Customers are most viewd at Tea Shop, Car Market Place, Restaurants and so on.",
    "q6": "Please leave a message",
    "q7": "Please enter booking reference number",
    "q8": "Please enter Vehicle Year",
    "q9": "Please enter Vehicle Brand (Eg: Toyota, Honda etc..)",
    "q10": "Please enter Vehicle Model (Eg: Vehical Name)",
    "q11": "Please enter Vehicle Kilo (Eg: May be 0 Kilo to 200000 Kilo)",
    "q12": "Vehicle Condition (Eg: Good or Bad)",
    "q13": "Please fill Vehicle Description",
    "q14": "How much do you expect this car to cost?",
    "q15": "Please enter a location"
}

const seller_bot_questions = {
    "que1": "Please enter a booking reference number",
    "que2": "Please enter Vehicle Year",
    "que3": "Please enter Vehicle Brand (Eg: Toyota, Honda etc..)",
    "que4": "Please enter Vehicle Model (Eg: Vehical Name)",
    "que5": "Please enter Vehicle Kilo (Eg: May be 0 Kilo to 200000 Kilo)",
    "que6": "Vehicle Condition (Eg: Good or Bad)",
    "que7": "Please fill Vehicle Description",
    "que8": "How much do you expect this car to cost?",
    "que9": "Which day do you want to meet? (dd-mm-yyyy)",
    "que10": "Choose a time. (PS :You can viewd within 9:00 to 17:00.) (hh:mm)",
    "que11": "Please enter a full name",
    "que12": "Would you like to leave a phone number?",
    "que13": "Where do you want to meet? PS : Customers are most meet at Tea Shop, Car Market Place, Restaurants and so on.",
}
let sess;
let current_question = '';
let user_id = '';
let userInputs = [];
/*
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
})*/
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 //no larger than 5mb
    }
});
// parse application/x-www-form-urlencoded
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
var firebaseConfig = {
    credential: firebase.credential.cert({
        "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        "client_email": process.env.FIREBASE_CLIENT_EMAIL,
        "project_id": process.env.FIREBASE_PROJECT_ID,
    }),
    databaseURL: process.env.FIREBASE_DB_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
};
firebase.initializeApp(firebaseConfig);
let db = firebase.firestore();
let bucket = firebase.storage().bucket();
// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));
// Accepts POST requests at /webhook endpoint
app.post('/webhook', (req, res) => {
    // Parse the request body from the POST
    let body = req.body;
    // Check the webhook event is from a Page subscription
    if (body.object === 'page') {
        body.entry.forEach(function(entry) {
            let webhook_event = entry.messaging[0];
            let sender_psid = webhook_event.sender.id;
            user_id = sender_psid;
            if (!userInputs[user_id]) {
                userInputs[user_id] = {};
            }
            if (webhook_event.message) {
                if (webhook_event.message.quick_reply) {
                    handleQuickReply(sender_psid, webhook_event.message.quick_reply.payload);
                } else {
                    handleMessage(sender_psid, webhook_event.message);
                }
            } else if (webhook_event.postback) {
                handlePostback(sender_psid, webhook_event.postback);
            }
        });
        // Return a '200 OK' response to all events
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Return a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }
});
app.use('/uploads', express.static('uploads'));
app.get('/', function(req, res) {
    res.send('your app is up and running');
});

// Start Login & Logout\
app.post('/login',function(req,res){    
    sess = req.session;

    let username = req.body.username;
    let password = req.body.password;

    if(username == 'admin' && password == process.env.ADMIN_PW){
      sess.username = 'admin';
      sess.login = true;
      res.redirect('/admin/appointments');
    }else{
      res.send('login failed');
    }   
});

app.get('/login',function(req,res){    
    sess = req.session;

    if(sess.login){
       res.redirect('/admin/appointments');
    }else{
      res.render('login.ejs');
    } 
    
});

app.get('/logout',function(req,res){ 
    //sess = req.session;   
    req.session.destroy(null);  
    res.redirect('login');
});

app.get('/publicpage',function(req,res){    
    res.render('publicpage.ejs');
});


app.get('/privatepage',function(req,res){ 
    sess = req.session;
    console.log('SESS:', sess); 
    if(sess.login){
       res.render('privatepage.ejs');
    }else{
      res.send('you are not authorized to view this page');
    }   
});
// End Login & Logout
// Start Admin Appointments
app.get('/admin/appointments', async function(req, res) {
    const buyerAppointmentsRef = db.collection('buyer_appointments');
    const sellerAppointmentsRef = db.collection('seller_appointments');
    // const ordersRef = db.collection('orders').where("ref", "==", order_ref).limit(1);
    const snapshot1 = await buyerAppointmentsRef.get();
    const snapshot2 = await sellerAppointmentsRef.get();

    if (snapshot1.empty && snapshot2.empty) {
        res.send('no data');
    }
    let buyerData = [];
    let sellerData = [];
    snapshot1.forEach(doc => {
        let buyerAppointment = {};
        buyerAppointment = doc.data();
        buyerAppointment.doc_id = doc.id;
        buyerData.push(buyerAppointment);
    });

    snapshot2.forEach(doc => {
        let sellerAappointment = {};
        sellerAappointment = doc.data();
        sellerAappointment.doc_id = doc.id;
        sellerData.push(sellerAappointment);
    });
    console.log('DATA:', buyerData);
    sess = req.session;
    console.log('SESS:', sess); 
    if(sess.login){
        res.render('appointments.ejs', {
        buyerData: buyerData,
        sellerData: sellerData
    });
    } else {
        res.send('you are not authorized to view this page');
    }
});

// Detail Seller Appointment
app.get('/admin/detailsappointment/:doc_id', async function(req, res) {
    let doc_id = req.params.doc_id;
    const appoinmentRef = db.collection('seller_appointments').doc(doc_id);
    const doc = await appoinmentRef.get();
    if (!doc.exists) {
        console.log('No such document!');
    } else {
        console.log('Document data:', doc.data());
        let data = doc.data();
        data.doc_id = doc.id;
        console.log('Document data:', data);
        res.render('detailsappointment.ejs', {
            data: data
        });
    }
});

// Detail Buyer Appointment
app.get('/admin/detailbappointment/:doc_id', async function(req, res) {
    let doc_id = req.params.doc_id;
    const appoinmentRef = db.collection('buyer_appointments').doc(doc_id);
    const doc = await appoinmentRef.get();
    if (!doc.exists) {
        console.log('No such document!');
    } else {
        console.log('Document data:', doc.data());
        let data = doc.data();
        data.doc_id = doc.id;
        console.log('Document data:', data);
        res.render('detailbappointment.ejs', {
            data: data
        });
    }
});

// START UPDATING BUYER APPOINTMENT
app.get('/admin/updatebappointment/:doc_id', async function(req, res) {
    let doc_id = req.params.doc_id;
    const appoinmentRef = db.collection('buyer_appointments').doc(doc_id);
    const doc = await appoinmentRef.get();
    if (!doc.exists) {
        console.log('No such document!');
    } else {
        console.log('Document data:', doc.data());
        let data = doc.data();
        data.doc_id = doc.id;
        console.log('Document data:', data);
        res.render('editbappointment.ejs', {
            data: data
        });
    }
});
app.post('/admin/updatebappointment', function(req, res) {
    console.log('REQ:', req.body);
    let data = {
        status: req.body.status,
        doc_id: req.body.doc_id,
        comment: req.body.comment
    }
    db.collection('buyer_appointments').doc(req.body.doc_id).update(data).then(() => {
        res.redirect('/admin/appointments');
    }).catch((err) => console.log('ERROR:', error));
});
// END UPDATING BUYER APPOINTMENT

// START UPDATING SELLER APPOINTMENT
app.get('/admin/updatesappointment/:doc_id', async function(req, res) {
    let doc_id = req.params.doc_id;
    const appoinmentRef = db.collection('seller_appointments').doc(doc_id);
    const doc = await appoinmentRef.get();
    if (!doc.exists) {
        console.log('No such document!');
    } else {
        console.log('Document data:', doc.data());
        let data = doc.data();
        data.doc_id = doc.id;
        console.log('Document data:', data);
        res.render('editsappointment.ejs', {
            data: data
        });
    }
});
app.post('/admin/updatesappointment', function(req, res) {
    console.log('REQ:', req.body);
    let data = {
        status: req.body.status,
        doc_id: req.body.doc_id,
        comment: req.body.comment
    }
    db.collection('seller_appointments').doc(req.body.doc_id).update(data).then(() => {
        res.redirect('/admin/appointments');
    }).catch((err) => console.log('ERROR:', error));
});
// END UPDATING SELLER APPOINTMENT
// End Admin Appointments

//Set up Get Started Button. To run one time
//eg https://fbstarter.herokuapp.com/setgsbutton
app.get('/setgsbutton', function(req, res) {
    setupGetStartedButton(res);
});
//Set up Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/setpersistentmenu
app.get('/setpersistentmenu', function(req, res) {
    setupPersistentMenu(res);
});
//Remove Get Started and Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/clear
app.get('/clear', function(req, res) {
    removePersistentMenu(res);
});
//whitelist domains
//eg https://fbstarter.herokuapp.com/whitelists
app.get('/whitelists', function(req, res) {
    whitelistDomains(res);
});
// Accepts GET requests at the /webhook endpoint
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    // Check token and mode
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});
/**********************************************
Function to Handle when user send quick reply message
***********************************************/
function handleQuickReply(sender_psid, received_message) {
    console.log('QUICK REPLY', received_message);
    received_message = received_message.toLowerCase();
    if (received_message == 'toyota') {
        // let brand = received_message;
        userInputs[user_id].brand = 'Toyota';
        shwoToyota(sender_psid);
    } else if (received_message == 'suzuki') {
        userInputs[user_id].brand = 'Suzuki';
        shwoSuzuki(sender_psid);
    } else if (received_message == 'honda') {
        userInputs[user_id].brand = 'Honda';
        shwoHonda(sender_psid);
    } else if (received_message == 'mitsubishi') {
        userInputs[user_id].brand = 'Mitsubishi';
        showMitsubishi(sender_psid);
    } else if (received_message == 'dihatsu') {
        userInputs[user_id].brand == 'Dihatsu';
        showDihatsu(sender_psid);
    } else if (received_message == 'nissan') {
        userInputs[user_id].brand == 'Nissan';
        showNissan(sender_psid);
    } else if (received_message == 'suvs') {
        userInputs[user_id].brand == 'SUVs';
        showSuv(sender_psid);
    } else if (received_message == 'sedan') {
        userInputs[user_id].brand == 'Sedan';
        showSedan(sender_psid);
    } else {
        switch (received_message) {
            case "fill":
                current_question = 'que2';
                sellerBotQuestions(current_question, sender_psid);
                break;
            case "on":
                showQuickReplyOn(sender_psid);
                break;
            case "off":
                showQuickReplyOff(sender_psid);
                break;
            case "confirm-seller-appointment":
                saveSellerAppointment(userInputs[user_id], sender_psid);
                break;
            case "confirm-buyer-appointment":
                saveBuyerAppointment(userInputs[user_id], sender_psid);
                break;
            default:
                defaultReply(sender_psid);
        }
    }
}
/**********************************************
Function to Handle when user send text message
***********************************************/
const handleMessage = (sender_psid, received_message) => {
    console.log('TEXT REPLY', received_message);
    //let message;
    let response;
    if (received_message.attachments) {
        handleAttachments(sender_psid, received_message.attachments);
    } else if (current_question == 'q1') {
        console.log('DATE ENTERED', received_message.text);
        userInputs[user_id].date = received_message.text;
        current_question = 'q2';
        buyerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'q2') {
        console.log('TIME ENTERED', received_message.text);
        userInputs[user_id].time = received_message.text;
        current_question = 'q3';
        buyerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'q3') {
        console.log('FULL NAME ENTERED', received_message.text);
        userInputs[user_id].name = received_message.text;
        current_question = 'q4';
        buyerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'q4') {
        console.log('PHONE NUMBER ENTERED', received_message.text);
        userInputs[user_id].phone = received_message.text;
        current_question = 'q5';
        buyerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'q5') {
        console.log('location ENTERED', received_message.text);
        userInputs[user_id].location = received_message.text;
        current_question = 'q6';
        buyerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'q6') {
        console.log('MESSAGE ENTERED', received_message.text);
        userInputs[user_id].message = received_message.text;
        current_question = '';
        confirmBuyerAppointment(sender_psid);
    } else if (current_question == 'q7') {
        let appointment_ref = received_message.text;
        console.log('appointment_ref: ', appointment_ref);
        current_question = '';
        checkAppointment(sender_psid, appointment_ref);
    } else if (current_question == 'que2') {
        console.log('Vehicle Year ENTERED', received_message.text);
        userInputs[user_id].vYear = received_message.text;
        current_question = 'que3';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que3') {
        console.log('Vehicle Brand ENTERED', received_message.text);
        userInputs[user_id].vBrand = received_message.text;
        current_question = 'que4';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que4') {
        console.log('Vehicle Model ENTERED', received_message.text);
        userInputs[user_id].vModel = received_message.text;
        current_question = 'que5';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que5') {
        console.log('Vehicle Kilo ENTERED', received_message.text);
        userInputs[user_id].vKilo = received_message.text;
        current_question = 'que6';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que6') {
        console.log('Vehicle Condition  ENTERED', received_message.text);
        userInputs[user_id].vCondition = received_message.text;
        current_question = 'que7';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que7') {
        console.log('Vehicle Description  ENTERED', received_message.text);
        userInputs[user_id].vDescription = received_message.text;
        current_question = 'que8';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que8') {
        console.log('Vehicle Cost ENTERED', received_message.text);
        userInputs[user_id].vCost = received_message.text;
        current_question = 'que9';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que9') {
        console.log('DATE ENTERED', received_message.text);
        userInputs[user_id].date = received_message.text;
        current_question = 'que10';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que10') {
        console.log('TIME ENTERED', received_message.text);
        userInputs[user_id].time = received_message.text;
        current_question = 'que11';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que11') {
        console.log('NAME ENTERED', received_message.text);
        userInputs[user_id].name = received_message.text;
        current_question = 'que12';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que12') {
        console.log('PHONE ENTERED', received_message.text);
        userInputs[user_id].phone = received_message.text;
        current_question = 'que13';
        sellerBotQuestions(current_question, sender_psid);
    } else if (current_question == 'que13') {
        console.log('Location ENTERED', received_message.text);
        userInputs[user_id].location = received_message.text;
        current_question = '';
        confirmSellerAppointment(sender_psid);
    } else {
        let user_message = received_message.text;
        user_message = user_message.toLowerCase();
        switch (user_message) {
            case "check":
                current_question = "q7";
                buyerBotQuestions(current_question, sender_psid);
                break;
            case "hi":
                hiReply(sender_psid);
                break;
            case "package":
                showPackage(sender_psid);
                break;
            case "webview":
                webviewTest(sender_psid);
                break;
            case "show images":
                showImages(sender_psid)
                break;
            default:
                defaultReply(sender_psid);
        }
    }
}
/*********************************************
Function to handle when user send attachment
**********************************************/
const handleAttachments = (sender_psid, attachments) => {
    console.log('ATTACHMENT', attachments);
    let response;
    let attachment_url = attachments[0].payload.url;
    response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Is this the right picture?",
                    "subtitle": "Tap a button to answer.",
                    "image_url": attachment_url,
                    "buttons": [{
                        "type": "postback",
                        "title": "Yes!",
                        "payload": "yes-attachment",
                    }, {
                        "type": "postback",
                        "title": "No!",
                        "payload": "no-attachment",
                    }],
                }]
            }
        }
    }
    callSend(sender_psid, response);
}
/*********************************************
Function to handle when user click button
**********************************************/
const handlePostback = (sender_psid, received_postback) => {
    let payload = received_postback.payload;
    console.log('BUTTON PAYLOAD', payload);
    if (payload.startsWith("Model:")) {
        let model_name = payload.slice(6);
        console.log('SELECTED PACKAGE IS: ', model_name);
        userInputs[user_id].model = model_name;
        console.log('TEST', userInputs);
        current_question = 'q1';
        buyerBotQuestions(current_question, sender_psid);
    } else {
        switch (payload) {
            case "get_started":
                hiReply(sender_psid);
                break;
            case "one":
                fillInfo(sender_psid);
                break;
            case "two":
                showCars(sender_psid);
                break;
            case "my-appointments":
                current_question = "q7";
                buyerBotQuestions(current_question, sender_psid);
                break;
            case "brands":
                showBrands(sender_psid);
                break;
            case "availcars":
                showAvailcars(sender_psid);
                break;
            case "yes":
                showButtonReplyYes(sender_psid);
                break;
            case "no":
                showButtonReplyNo(sender_psid);
                break;
            default:
                defaultReply(sender_psid);
        }
    }
}
const generateRandom = (length) => {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
/*********************************************
GALLERY SAMPLE
**********************************************/
const showImages = (sender_psid) => {
    let response;
    response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "show images",
                    "buttons": [{
                        "type": "web_url",
                        "title": "enter",
                        "url": "https://fbstarter.herokuapp.com/showimages/" + sender_psid,
                        "webview_height_ratio": "full",
                        "messenger_extensions": true,
                    }, ],
                }]
            }
        }
    }
    callSendAPI(sender_psid, response);
}
/*********************************************
END GALLERY SAMPLE
**********************************************/
function webviewTest(sender_psid) {
    let response;
    response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Click to open webview?",
                    "buttons": [{
                        "type": "web_url",
                        "title": "webview",
                        "url": APP_URL + "webview/" + sender_psid,
                        "webview_height_ratio": "full",
                        "messenger_extensions": true,
                    }, ],
                }]
            }
        }
    }
    callSendAPI(sender_psid, response);
}
const checkAppointment = async (sender_psid, appointment_ref) => {

    const sellerAppoinmentRef = db.collection('seller_appointments').where("ref", "==", appointment_ref).limit(1);
    const snapshot1 = await sellerAppoinmentRef.get();

    const buyerAppoinmentRef = db.collection('buyer_appointments').where("ref", "==", appointment_ref).limit(1);
    const snapshot2 = await buyerAppoinmentRef.get();


    if (snapshot1.empty && snapshot2.empty) {
        let response = { "text": "Incorrect booking ref number" };
        callSend(sender_psid, response);
    } else {
        let sellerAppointment = {};
        let buyerAppointment = {};

        snapshot1.forEach(doc => {
            sellerAppointment.ref = doc.data().ref;
            sellerAppointment.status = doc.data().status;
            sellerAppointment.name = doc.data().name;
            sellerAppointment.comment = doc.data().comment;
        });

        snapshot2.forEach(doc => {
            buyerAppointment.ref = doc.data().ref;
            buyerAppointment.status = doc.data().status;
            buyerAppointment.name = doc.data().name;
            buyerAppointment.comment = doc.data().comment;
        });

        if (sellerAppointment.ref == appointment_ref) {
            let response1 = { "text": `Hello ${sellerAppointment.name}. Your appointment ${sellerAppointment.ref} is ${sellerAppointment.status}.` };
            let response2 = { "text": `Admin comment: ${sellerAppointment.comment}.` };
            callSend(sender_psid, response1).then(() => {
                return callSend(sender_psid, response2)
            });
        } else {
            let response1 = { "text": `Hello ${buyerAppointment.name}. Your appointment ${buyerAppointment.ref} is ${buyerAppointment.status}.` };
            let response2 = { "text": `Admin comment: ${buyerAppointment.comment}.` };
            callSend(sender_psid, response1).then(() => {
                return callSend(sender_psid, response2)
            });
        }

    }

}
const showPackage = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Wedding",
                    "image_url": "https://discoverfarmersbranch.com/wp-content/uploads/Fondon-Wedding_Farmers-Branch_025_a-500x500.jpg",
                    "buttons": [{
                        "type": "postback",
                        "title": "Wedding",
                        "payload": "Package:Wedding",
                    }, ],
                }, {
                    "title": "Graduation",
                    "image_url": "https://www.adriasolutions.co.uk/wp-content/uploads/2015/07/shutterstock_658847998-1000x526.jpg",
                    "buttons": [{
                        "type": "postback",
                        "title": "Graduation",
                        "payload": "Package:Graduation",
                    }, ],
                }, {
                    "title": "Donation",
                    "image_url": "https://d.wildapricot.net/images/default-album/how-to-get-donations.jpg",
                    "buttons": [{
                        "type": "postback",
                        "title": "Donation",
                        "payload": "Package:Donation",
                    }, ],
                }]
            }
        }
    }
    callSend(sender_psid, response);
}
const sellerBotQuestions = (current_question, sender_psid) => {
    if (current_question == 'que1') {
        let response = {
            "text": seller_bot_questions.que1
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que2') {
        let response = {
            "text": seller_bot_questions.que2
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que3') {
        let response = {
            "text": seller_bot_questions.que3
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que4') {
        let response = {
            "text": seller_bot_questions.que4
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que5') {
        let response = {
            "text": seller_bot_questions.que5
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que6') {
        let response = {
            "text": seller_bot_questions.que6
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que7') {
        let response = {
            "text": seller_bot_questions.que7
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que8') {
        let response = {
            "text": seller_bot_questions.que8
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que9') {
        let response = {
            "text": seller_bot_questions.que9
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que10') {
        let response = {
            "text": seller_bot_questions.que10
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que11') {
        let response = {
            "text": seller_bot_questions.que11
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que12') {
        let response = {
            "text": seller_bot_questions.que12
        };
        callSend(sender_psid, response);
    } else if (current_question == 'que13') {
        let response = {
            "text": seller_bot_questions.que13
        };
        callSend(sender_psid, response);
    }
}
const buyerBotQuestions = (current_question, sender_psid) => {
    if (current_question == 'q1') {
        let response = {
            "text": buyer_bot_questions.q1
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q2') {
        let response = {
            "text": buyer_bot_questions.q2
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q3') {
        let response = {
            "text": buyer_bot_questions.q3
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q4') {
        let response = {
            "text": buyer_bot_questions.q4
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q5') {
        let response = {
            "text": buyer_bot_questions.q5
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q6') {
        let response = {
            "text": buyer_bot_questions.q6
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q7') {
        let response = {
            "text": buyer_bot_questions.q7
        };
        callSend(sender_psid, response);
    }
}
const confirmSellerAppointment = (sender_psid) => {
    console.log('APPOINTMENT INFO', userInputs);
    let summery = "Vehicle year:" + userInputs[user_id].vYear + "\u000A";
    summery += "Vehicle brand:" + userInputs[user_id].vBrand + "\u000A";
    summery += "Vehicle model:" + userInputs[user_id].vModel + "\u000A";
    summery += "Vehicle kilo:" + userInputs[user_id].vKilo + "\u000A";
    summery += "Vehicle Condition:" + userInputs[user_id].vCondition + "\u000A";
    summery += "Vehicle Description:" + userInputs[user_id].vDescription + "\u000A";
    summery += "Vehicle Cost:" + userInputs[user_id].vCost + "\u000A";
    summery += "date:" + userInputs[user_id].date + "\u000A";
    summery += "time:" + userInputs[user_id].time + "\u000A";
    summery += "name:" + userInputs[user_id].name + "\u000A";
    summery += "phone:" + userInputs[user_id].phone + "\u000A";
    summery += "location:" + userInputs[user_id].location + "\u000A";

    let response1 = {
        "text": summery
    };
    let response2 = {
        "text": "Select your reply",
        "quick_replies": [{
            "content_type": "text",
            "title": "Confirm",
            "payload": "confirm-seller-appointment",
        }, {
            "content_type": "text",
            "title": "Cancel",
            "payload": "off",
        }]
    };
    callSend(sender_psid, response1).then(() => {
        return callSend(sender_psid, response2);
    });
}

const confirmBuyerAppointment = (sender_psid) => {
    console.log('APPOINTMENT INFO', userInputs);
    let summery = "brand:" + userInputs[user_id].brand + "\u000A";
    summery += "model:" + userInputs[user_id].model + "\u000A";
    summery += "date:" + userInputs[user_id].date + "\u000A";
    summery += "time:" + userInputs[user_id].time + "\u000A";
    summery += "name:" + userInputs[user_id].name + "\u000A";
    summery += "phone:" + userInputs[user_id].phone + "\u000A";
    summery += "location:" + userInputs[user_id].location + "\u000A";
    summery += "message:" + userInputs[user_id].message + "\u000A";
    let response1 = {
        "text": summery
    };
    let response2 = {
        "text": "Select your reply",
        "quick_replies": [{
            "content_type": "text",
            "title": "Confirm",
            "payload": "confirm-buyer-appointment",
        }, {
            "content_type": "text",
            "title": "Cancel",
            "payload": "off",
        }]
    };
    callSend(sender_psid, response1).then(() => {
        return callSend(sender_psid, response2);
    });
}
const saveSellerAppointment = (arg, sender_psid) => {
    let data = arg;
    data.ref = generateRandom(6);
    data.status = "pending";
    db.collection('seller_appointments').add(data).then((success) => {
        console.log('SAVED', success);
        let text = "Thank you. We have received your appointment." + "\u000A";
        text += " We wil call you to confirm soon" + "\u000A";
        text += "Your booking reference number is:";
        let refNo = data.ref;
        let response1 = {
            "text": text
        };
        let response2 = {
            "text": refNo
        }
        callSend(sender_psid, response1).then(() => {
            return callSend(sender_psid, response2);
        });
    }).catch((err) => {
        console.log('Error', err);
    });
}

const saveBuyerAppointment = (arg, sender_psid) => {
    let data = arg;
    data.ref = generateRandom(6);
    data.status = "pending";
    db.collection('buyer_appointments').add(data).then((success) => {
        console.log('SAVED', success);
        let text = "Thank you. We have received your appointment." + "\u000A";
        text += " We wil call you to confirm soon" + "\u000A";
        text += "Your booking reference number is:";
        let refNo = data.ref;
        let response1 = {
            "text": text
        };
        let response2 = {
            "text": refNo
        }
        callSend(sender_psid, response1).then(() => {
            return callSend(sender_psid, response2);
        });
    }).catch((err) => {
        console.log('Error', err);
    });
}

const hiReply = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": "Hi..Mingalar Par Bya. How can we help you today?",
                "buttons": [{
                    "type": "postback",
                    "title": "Sell my car",
                    "payload": "one"
                }, {
                    "type": "postback",
                    "title": "Find me a car",
                    "payload": "two"
                }, {
                    "type": "postback",
                    "title": "My Appointments",
                    "payload": "my-appointments"
                }]
            }
        }
    }
    callSend(sender_psid, response);
}
const fillInfo = (sender_psid) => {
    let response = {
        "text": "You need to fill vehicle information below",
        "quick_replies": [{
            "content_type": "text",
            "title": "Fill vehicle info",
            "payload": "fill"

        }]

    };
    callSend(sender_psid, response);
}

const showCars = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": "You can choice as following",
                "buttons": [{
                    "type": "postback",
                    "title": "Car Brands",
                    "payload": "brands"
                }, {
                    "type": "postback",
                    "title": "Available Cars!",
                    "payload": "availcars"
                }]
            }
        }
    };
    callSend(sender_psid, response);
}
// Car Brands
const showBrands = (sender_psid) => {
    let response = {
        "text": "Choose a brand of vehicles you are looking for",
        "quick_replies": [{
            "content_type": "text",
            "title": "Toyota",
            "payload": "toyota",
        }, {
            "content_type": "text",
            "title": "Suzuki",
            "payload": "suzuki",
        }, {
            "content_type": "text",
            "title": "Honda",
            "payload": "honda",
        }, {
            "content_type": "text",
            "title": "Mitsubishi",
            "payload": "mitsubishi",
        }, {
            "content_type": "text",
            "title": "Dihatsu",
            "payload": "dihatsu",
        }, {
            "content_type": "text",
            "title": "Nissan",
            "payload": "nissan",
        }]
    };
    callSend(sender_psid, response);
}

// Aavailcars
const showAvailcars = (sender_psid) => {
    let response = {
        "text": "Choose a brand of vehicles you are looking for",
        "quick_replies": [{
                "content_type": "text",
                "title": "SUVs",
                "payload": "suvs",
            },
            {
                "content_type": "text",
                "title": "Sedan",
                "payload": "sedan",
            }
        ]
    };
    callSend(sender_psid, response);
}
// START TOYOTA
const shwoToyota = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Toyota Mark 2,2000model,2.0cc, Regalia",
                    "image_url": "https://i.imgur.com/edMypcb.jpg",
                    "subtitle": "MMK : 250 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140544484200823/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140544484200823/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:Toyota Mark 2,2000model,2.0cc, Regalia",
                    }]
                }, {
                    "title": "Toyota Brevis 2001,3.0cc",
                    "image_url": "https://i.imgur.com/0azLEeH.jpg",
                    "subtitle": "MMK : 320 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140619837526621/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140619837526621/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:Toyota Brevis 2001,3.0cc",
                    }]
                }, {
                    "title": "Toyota Belta 2009",
                    "image_url": "https://i.imgur.com/ZHWuIbz.jpg",
                    "subtitle": "MMK : 220 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140841997504405/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140841997504405/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:Toyota Belta 2009",
                    }]
                }, {
                    "title": "2007 Toyota Ractics",
                    "image_url": "https://i.imgur.com/SKVAE3s.jpg",
                    "subtitle": "MMK : 170 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140520600869878/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140520600869878/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:2007 Toyota Ractics",
                    }]
                }, {
                    "title": "Toyota Hilux surf 1999 SSR G",
                    "image_url": "https://i.imgur.com/nRdG4yP.jpg",
                    "subtitle": "MMK : 385 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141094117479193/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141094117479193/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:Toyota Hilux surf 1999 SSR G",
                    }]
                }, {
                    "title": "Toyota Parado 1997,TX package",
                    "image_url": "https://i.imgur.com/5w6mtdH.jpg",
                    "subtitle": "MMK : 150 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141097234145548/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141097234145548/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:Toyota Parado 1997,TX package",
                    }]
                }, {
                    "title": "2004 late Toyota Hilux Surf",
                    "image_url": "https://i.imgur.com/lD8nB8I.jpg",
                    "subtitle": "MMK : 430 kh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141108330811105/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141108330811105/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:2004 late Toyota Hilux Surf",
                    }]
                }, {
                    "title": "Toyota Harrier 1999 G Package",
                    "image_url": "https://i.imgur.com/9FTJXr1.jpg",
                    "subtitle": "MMK : 180 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141104947478110/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/141104947478110/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:Toyota Harrier 1999 G Package",
                    }]
                }]
            }
        }
    };
    callSend(sender_psid, response);
}
// END TOYOTA

// START SUZUKI
const shwoSuzuki = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "2012 Suzuki Swift",
                    "image_url": "https://i.imgur.com/BBocmu5.jpg",
                    "subtitle": "MMK : 170 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140844540837484/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140844540837484/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:2012 Suzuki Swift"
                    }]
                }]
            }
        }
    };
    callSend(sender_psid, response);
}
// END SUZIKI

// START HONDA
const shwoHonda = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                        "title": "2008 Honda Fit",
                        "image_url": "https://i.imgur.com/pPU86Il.jpg",
                        "subtitle": "MMK : 188 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140497514205520/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140497514205520/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:2008 Honda Fit"
                        }]
                    },
                    {
                        "title": "Honda Insight 2009",
                        "image_url": "https://i.imgur.com/ykHdyGd.jpg",
                        "subtitle": "MMK : 176 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140847464170525/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140847464170525/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Honda Insight 2009"
                        }]
                    }
                ]
            }
        }
    };
    callSend(sender_psid, response);
}
// END HONDA

// START MITSUBISHI
const showMitsubishi = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                        "title": "2010 Misubishi Colt Plus",
                        "image_url": "https://i.imgur.com/evfqDfU.jpg",
                        "subtitle": "MMK : 155 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140530477535557/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140530477535557/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:2010 Misubishi Colt Plus"
                        }]
                    },
                    {
                        "title": "Misubishi Delica D2,1.3cc,2wd",
                        "image_url": "https://i.imgur.com/gbKFTc8.jpg",
                        "subtitle": "MMK : 167 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140612220860716/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140612220860716/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Misubishi Delica D2,1.3cc,2wd"
                        }]
                    },
                    {
                        "title": "Misubishi Minicab",
                        "image_url": "https://i.imgur.com/RR4JwzK.jpgs",
                        "subtitle": "MMK : 110 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140806450841293/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140806450841293/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Misubishi Minicab"
                        }]
                    }
                ]
            }
        }
    };
    callSend(sender_psid, response);
}
// END MITISUBISHI

// START DIHATSU
const showDihatsu = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "2010 Dihatsu Cool",
                    "image_url": "https://i.imgur.com/1BXIlSq.jpg",
                    "subtitle": "MMK : 165 lkh",
                    "default_action": {
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140523607536244/",
                        "webview_height_ratio": "tall",
                    },
                    "buttons": [{
                        "type": "web_url",
                        "url": "https://www.facebook.com/101330348122237/posts/140523607536244/",
                        "title": "More Information"
                    }, {
                        "type": "postback",
                        "title": "Yes, I'm interested",
                        "payload": "Model:2010 Dihatsu Cool"
                    }]
                }]
            }
        }
    };
    callSend(sender_psid, response);
}
// END DIHATSU

// START NISSAN
const showNissan = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                        "title": "Nissan Cedric 2001",
                        "image_url": "https://i.imgur.com/zz18si2.jpg",
                        "subtitle": "MMK : 420 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140526790869259/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140526790869259/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Nissan Cedric 2001"
                        }]
                    },
                    {
                        "title": "Nissan Sunny 2009",
                        "image_url": "https://i.imgur.com/vFNZvGg.jpg",
                        "subtitle": "MMK : 230 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141087177479887/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141087177479887/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Nissan Sunny 2009"
                        }]
                    }
                ]
            }
        }
    };
    callSend(sender_psid, response);
}
// END NISSAN

// START SUV
const showSuv = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                        "title": "Toyota Hilux surf 1999 SSR G",
                        "image_url": "https://i.imgur.com/nRdG4yP.jpg",
                        "subtitle": "MMK : 385 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141094117479193/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141094117479193/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Toyota Hilux surf 1999 SSR G"
                        }]
                    },
                    {
                        "title": "Toyota Parado 1997,TX package",
                        "image_url": "https://i.imgur.com/5w6mtdH.jpg",
                        "subtitle": "MMK : 150 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141097234145548/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141097234145548/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Toyota Parado 1997,TX package"
                        }]
                    },
                    {
                        "title": "2004 late Toyota Hilux Surf",
                        "image_url": "https://i.imgur.com/lD8nB8I.jpg",
                        "subtitle": "MMK : 430 kh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141108330811105/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141108330811105/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:2004 late Toyota Hilux Surf"
                        }]
                    },
                    {
                        "title": "Toyota Harrier 1999 G Package",
                        "image_url": "https://i.imgur.com/9FTJXr1.jpg",
                        "subtitle": "MMK : 180 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141104947478110/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141104947478110/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Toyota Harrier 1999 G Package"
                        }]
                    }

                ]
            }
        }
    };
    callSend(sender_psid, response);
}

// START SEDAN
const showSedan = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                        "title": "Toyota Mark 2,2000model,2.0cc, Regalia",
                        "image_url": "https://i.imgur.com/edMypcb.jpg",
                        "subtitle": "MMK : 250 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140544484200823/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140544484200823/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Toyota Mark 2,2000model,2.0cc, Regalia"
                        }]
                    },
                    {
                        "title": "Nissan Cedric 2001",
                        "image_url": "https://i.imgur.com/zz18si2.jpg",
                        "subtitle": "MMK : 420 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140526790869259/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140526790869259/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Nissan Cedric 2001"
                        }]
                    },
                    {
                        "title": "Nissan Sunny 2009",
                        "image_url": "https://i.imgur.com/vFNZvGg.jpg",
                        "subtitle": "MMK : 230 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141087177479887/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/141087177479887/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Nissan Sunny 2009"
                        }]
                    },
                    {
                        "title": "Toyota Brevis 2001,3.0cc",
                        "image_url": "https://i.imgur.com/0azLEeH.jpg",
                        "subtitle": "MMK : 320 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140619837526621/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140619837526621/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Toyota Brevis 2001,3.0cc"
                        }]
                    },
                    {
                        "title": "Toyota Belta 2009",
                        "image_url": "https://i.imgur.com/ZHWuIbz.jpg",
                        "subtitle": "MMK : 220 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140841997504405/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140841997504405/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Toyota Belta 2009"
                        }]
                    },
                    {
                        "title": "Honda Insight 2009",
                        "image_url": "https://i.imgur.com/ykHdyGd.jpg",
                        "subtitle": "MMK : 176 lkh",
                        "default_action": {
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140847464170525/",
                            "webview_height_ratio": "tall",
                        },
                        "buttons": [{
                            "type": "web_url",
                            "url": "https://www.facebook.com/101330348122237/posts/140847464170525/",
                            "title": "More Information"
                        }, {
                            "type": "postback",
                            "title": "Yes, I'm interested",
                            "payload": "Model:Honda Insight 2009"
                        }]
                    }
                ]
            }
        }
    };
    callSend(sender_psid, response);
}
const showQuickReplyOff = (sender_psid) => {
    let response = { "text": "You sent quick reply OFF" };
    callSend(sender_psid, response);
}

const thankyouReply = (sender_psid, name, img_url) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Thank you! " + name,
                    "image_url": img_url,
                    "buttons": [{
                        "type": "postback",
                        "title": "Yes!",
                        "payload": "yes",
                    }, {
                        "type": "postback",
                        "title": "No!",
                        "payload": "no",
                    }],
                }]
            }
        }
    }
    callSend(sender_psid, response);
}

function testDelete(sender_psid) {
    let response;
    response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Delete Button Test",
                    "buttons": [{
                        "type": "web_url",
                        "title": "enter",
                        "url": "https://fbstarter.herokuapp.com/test/",
                        "webview_height_ratio": "full",
                        "messenger_extensions": true,
                    }, ],
                }]
            }
        }
    }
    callSendAPI(sender_psid, response);
}
const defaultReply = (sender_psid) => {
    let response1 = {
        "text": "To Start, please type 'hi'"
    };
    let response2 = {
        "text": "To check appointments, please type 'check'"
    };
    callSend(sender_psid, response1).then(() => {
        return callSend(sender_psid, response2)
    });
}
const callSendAPI = (sender_psid, response) => {
    let request_body = {
        "recipient": {
            "id": sender_psid
        },
        "message": response
    }
    return new Promise(resolve => {
        request({
            "uri": "https://graph.facebook.com/v6.0/me/messages",
            "qs": {
                "access_token": PAGE_ACCESS_TOKEN
            },
            "method": "POST",
            "json": request_body
        }, (err, res, body) => {
            if (!err) {
                //console.log('RES', res);
                console.log('BODY', body);
                resolve('message sent!')
            } else {
                console.error("Unable to send message:" + err);
            }
        });
    });
}
async function callSend(sender_psid, response) {
    let send = await callSendAPI(sender_psid, response);
    return 1;
}
const uploadImageToStorage = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject('No image file');
        }
        let newFileName = `${Date.now()}_${file.originalname}`;
        let fileUpload = bucket.file(newFileName);
        const blobStream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    firebaseStorageDownloadTokens: uuidv4
                }
            }
        });
        blobStream.on('error', (error) => {
            console.log('BLOB:', error);
            reject('Something is wrong! Unable to upload at the moment.');
        });
        blobStream.on('finish', () => {
            // The public URL can be used to directly access the file via HTTP.
            //const url = format(`https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`);
            const url = format(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${fileUpload.name}?alt=media&token=${uuidv4}`);
            console.log("image url:", url);
            resolve(url);
        });
        blobStream.end(file.buffer);
    });
}
/*************************************
FUNCTION TO SET UP GET STARTED BUTTON
**************************************/
const setupGetStartedButton = (res) => {
    let messageData = {
        "get_started": {
            "payload": "get_started"
        }
    };
    request({
        url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token=' + PAGE_ACCESS_TOKEN,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        form: messageData
    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            res.send(body);
        } else {
            // TODO: Handle errors
            res.send(body);
        }
    });
}
/**********************************
FUNCTION TO SET UP PERSISTENT MENU
***********************************/
const setupPersistentMenu = (res) => {
    var messageData = {
        "persistent_menu": [{
            "locale": "default",
            "composer_input_disabled": false,
            "call_to_actions": [{
                "type": "postback",
                "title": "Sell my car",
                "payload": "one"
            }, {
                "type": "postback",
                "title": "Find Me a car",
                "payload": "two"
            }, {
                "type": "postback",
                "title": "My Appointments",
                "payload": "my-appointments"
            }]
        }, {
            "locale": "default",
            "composer_input_disabled": false
        }]
    };
    request({
        url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token=' + PAGE_ACCESS_TOKEN,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        form: messageData
    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            res.send(body);
        } else {
            res.send(body);
        }
    });
}
/***********************
FUNCTION TO REMOVE MENU
************************/
const removePersistentMenu = (res) => {
    var messageData = {
        "fields": ["persistent_menu", "get_started"]
    };
    request({
        url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token=' + PAGE_ACCESS_TOKEN,
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        form: messageData
    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            res.send(body);
        } else {
            res.send(body);
        }
    });
}
/***********************************
FUNCTION TO ADD WHITELIST DOMAIN
************************************/
const whitelistDomains = (res) => {
    var messageData = {
        "whitelisted_domains": [
            APP_URL, "https://herokuapp.com",
        ]
    };
    request({
        url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token=' + PAGE_ACCESS_TOKEN,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        form: messageData
    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            res.send(body);
        } else {
            res.send(body);
        }
    });
}