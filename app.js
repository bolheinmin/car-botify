'use strict';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL;
//new text
// Imports dependencies and set up http server
const {
    uuid
} = require('uuidv4'), {
        format
    } = require('util'),
    request = require('request'),
    express = require('express'),
    body_parser = require('body-parser'),
    firebase = require("firebase-admin"),
    ejs = require("ejs"),
    fs = require('fs'),
    multer = require('multer'),
    app = express();
const uuidv4 = uuid();
app.use(body_parser.json());
app.use(body_parser.urlencoded());
app.use(express.static(__dirname + '/public'));
const bot_questions = {
    "q1": "Which day do you want to see? (dd-mm-yyyy)",
    "q2": "Choose Time. (PS :You can viewd within 9:00 to 17:00.) (hh:mm)",
    "q3": "Please enter full name",
    "q4": "Would you like to leave a phone number",
    "q5": "Where do you want to look the car? PS : Customers are most viewd at Tea Shop, Car Market Place, Restaurants and so on.",
    "q6": "Please leave a message",
    "q7": "Please enter reference no"
}
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
app.get('/test', function(req, res) {
    res.render('test.ejs');
});
app.post('/test', function(req, res) {
    const sender_psid = req.body.sender_id;
    let response = {
        "text": "You  click delete button"
    };
    callSend(sender_psid, response);
});
app.get('/admin/appointments', async function(req, res) {
    const appointmentsRef = db.collection('appointments');
    // const ordersRef = db.collection('orders').where("ref", "==", order_ref).limit(1);
    const snapshot = await appointmentsRef.get();
    if (snapshot.empty) {
        res.send('no data');
    }
    let data = [];
    snapshot.forEach(doc => {
        let appointment = {};
        appointment = doc.data();
        appointment.doc_id = doc.id;
        data.push(appointment);
    });
    console.log('DATA:', data);
    res.render('appointments.ejs', {
        data: data
    });
});
app.get('/admin/updateappointment/:doc_id', async function(req, res) {
    let doc_id = req.params.doc_id;
    const appoinmentRef = db.collection('appointments').doc(doc_id);
    const doc = await appoinmentRef.get();
    if (!doc.exists) {
        console.log('No such document!');
    } else {
        console.log('Document data:', doc.data());
        let data = doc.data();
        data.doc_id = doc.id;
        console.log('Document data:', data);
        res.render('editappointment.ejs', {
            data: data
        });
    }
});
app.post('/admin/updateappointment', function(req, res) {
    console.log('REQ:', req.body);
    let data = {
        name: req.body.name,
        phone: req.body.phone,
        brand: req.body.brand,
        location: req.body.location,
        date: req.body.date,
        time: req.body.time,
        message: req.body.message,
        status: req.body.status,
        doc_id: req.body.doc_id,
        ref: req.body.ref,
        comment: req.body.comment
    }
    db.collection('appointments').doc(req.body.doc_id).update(data).then(() => {
        res.redirect('/admin/appointments');
    }).catch((err) => console.log('ERROR:', error));
});
/*********************************************
Gallery page
**********************************************/
app.get('/showimages/:sender_id/', function(req, res) {
    const sender_id = req.params.sender_id;
    let data = [];
    db.collection("images").limit(20).get().then(function(querySnapshot) {
        querySnapshot.forEach(function(doc) {
            let img = {};
            img.id = doc.id;
            img.url = doc.data().url;
            data.push(img);
        });
        console.log("DATA", data);
        res.render('gallery.ejs', {
            data: data,
            sender_id: sender_id,
            'page-title': 'welcome to my page'
        });
    }).catch(function(error) {
        console.log("Error getting documents: ", error);
    });
});
app.post('/imagepick', function(req, res) {
    const sender_id = req.body.sender_id;
    const doc_id = req.body.doc_id;
    console.log('DOC ID:', doc_id);
    db.collection('images').doc(doc_id).get().then(doc => {
        if (!doc.exists) {
            console.log('No such document!');
        } else {
            const image_url = doc.data().url;
            console.log('IMG URL:', image_url);
            let response = {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "generic",
                        "elements": [{
                            "title": "Is this the image you like?",
                            "image_url": image_url,
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
            callSend(sender_id, response);
        }
    }).catch(err => {
        console.log('Error getting document', err);
    });
});
/*********************************************
END Gallery Page
**********************************************/
//webview test
app.get('/webview/:sender_id', function(req, res) {
    const sender_id = req.params.sender_id;
    res.render('webview.ejs', {
        title: "Hello!! from WebView",
        sender_id: sender_id
    });
});
app.post('/webview', upload.single('file'), function(req, res) {
    let name = req.body.name;
    let email = req.body.email;
    let img_url = "";
    let sender = req.body.sender;
    console.log("REQ FILE:", req.file);
    let file = req.file;
    if (file) {
        uploadImageToStorage(file).then((img_url) => {
            db.collection('webview').add({
                name: name,
                email: email,
                image: img_url
            }).then(success => {
                console.log("DATA SAVED")
                thankyouReply(sender, name, img_url);
            }).catch(error => {
                console.log(error);
            });
        }).catch((error) => {
            console.error(error);
        });
    }
});
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
    if (received_message.startsWith("brand:")) {
        let brand = received_message.slice(6);
        userInputs[user_id].brand = brand;
        shwoToyota(sender_psid);
    } else {
        switch (received_message) {
            case "on":
                showQuickReplyOn(sender_psid);
                break;
            case "off":
                showQuickReplyOff(sender_psid);
                break;
            case "confirm-appointment":
                saveAppointment(userInputs[user_id], sender_psid);
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
    } else if (received_message.text == 'toyota') {
        console.log('BRAND ENTERED', received_message.text);

    } else if (current_question == 'q1') {
        console.log('DATE ENTERED', received_message.text);
        userInputs[user_id].date = received_message.text;
        current_question = 'q2';
        botQuestions(current_question, sender_psid);
    } else if (current_question == 'q2') {
        console.log('TIME ENTERED', received_message.text);
        userInputs[user_id].time = received_message.text;
        current_question = 'q3';
        botQuestions(current_question, sender_psid);
    } else if (current_question == 'q3') {
        console.log('FULL NAME ENTERED', received_message.text);
        userInputs[user_id].name = received_message.text;
        current_question = 'q4';
        botQuestions(current_question, sender_psid);
    } else if (current_question == 'q4') {
        console.log('PHONE NUMBER ENTERED', received_message.text);
        userInputs[user_id].phone = received_message.text;
        current_question = 'q5';
        botQuestions(current_question, sender_psid);
    } else if (current_question == 'q5') {
        console.log('location ENTERED', received_message.text);
        userInputs[user_id].location = received_message.text;
        current_question = 'q6';
        botQuestions(current_question, sender_psid);
    } else if (current_question == 'q6') {
        console.log('MESSAGE ENTERED', received_message.text);
        userInputs[user_id].message = received_message.text;
        current_question = '';
        confirmAppointment(sender_psid);
    } else if (current_question == 'q7') {
        let appointment_ref = received_message.text;

        console.log('appointment_ref: ', appointment_ref);
        current_question = '';
        checkAppointment(sender_psid, appointment_ref);
    } else {
        let user_message = received_message.text;
        user_message = user_message.toLowerCase();
        switch (user_message) {
            case "check":
                current_question = "q7";
                botQuestions(current_question, sender_psid);
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
    if (payload.startsWith("Toyota:")) {
        let toyota_name = payload.slice(7);
        console.log('SELECTED PACKAGE IS: ', toyota_name);
        userInputs[user_id].toyota = toyota_name;
        console.log('TEST', userInputs);
        current_question = 'q1';
        botQuestions(current_question, sender_psid);
    } else {
        switch (payload) {
            case "two":
                showCars(sender_psid);
                break;
            case "brands":
                showBrands(sender_psid);
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

    const appoinmentRef = db.collection('appointments').where("ref", "==", appointment_ref).limit(1);
    const snapshot = await appoinmentRef.get();


    if (snapshot.empty) {
        let response = { "text": "Incorrect ref number" };
        callSend(sender_psid, response);
    } else {
        let appointment = {}

        snapshot.forEach(doc => {
            appointment.ref = doc.data().ref;
            appointment.status = doc.data().status;
            // appointment.comment = doc.data().comment;
        });


        let response1 = { "text": `Your appointment ${appointment.ref} is ${appointment.status}.` };
        // let response2 = { "text": `Admin comment: ${appointment.comment}.` };
        callSend(sender_psid, response1);
        // .then(() => {
        //     return callSend(sender_psid, response2)
        // });
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
const botQuestions = (current_question, sender_psid) => {
    if (current_question == 'q1') {
        let response = {
            "text": bot_questions.q1
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q2') {
        let response = {
            "text": bot_questions.q2
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q3') {
        let response = {
            "text": bot_questions.q3
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q4') {
        let response = {
            "text": bot_questions.q4
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q5') {
        let response = {
            "text": bot_questions.q5
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q6') {
        let response = {
            "text": bot_questions.q6
        };
        callSend(sender_psid, response);
    } else if (current_question == 'q7') {
        let response = {
            "text": bot_questions.q7
        };
        callSend(sender_psid, response);
    }
}
const confirmAppointment = (sender_psid) => {
    console.log('APPOINTMENT INFO', userInputs);
    let summery = "brand:" + userInputs[user_id].brand + "\u000A";
    summery += "toyota:" + userInputs[user_id].toyota + "\u000A";
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
            "payload": "confirm-appointment",
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
const saveAppointment = (arg, sender_psid) => {
    let data = arg;
    data.ref = generateRandom(6);
    data.status = "pending";
    db.collection('appointments').add(data).then((success) => {
        console.log('SAVED', success);
        let text = "Thank you. We have received your appointment." + "\u000A";
        text += " We wil call you to confirm soon" + "\u000A";
        text += "Your booking reference number is:" + data.ref;
        let response = {
            "text": text
        };
        callSend(sender_psid, response);
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
                "text": "Hi..Mingalar Par Bya.  How can we help you today?",
                "buttons": [{
                    "type": "postback",
                    "title": "Sell my car",
                    "payload": "one"
                }, {
                    "type": "postback",
                    "title": "Find me a car",
                    "payload": "two"
                }]
            }
        }
    }
    callSend(sender_psid, response);
}
const showCars = (sender_psid) => {
    let response = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": "You can choice as folling",
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
const showBrands = (sender_psid) => {
    let response = {
        "text": "Choose a type of vehicles you are looking for",
        "quick_replies": [{
            "content_type": "text",
            "title": "Toyota",
            "payload": "brand:Toyota",
        }, {
            "content_type": "text",
            "title": "Suzuki",
            "payload": "brand:Suzuki",
        }, {
            "content_type": "text",
            "title": "Honda",
            "payload": "brand:Honda",
        }, {
            "content_type": "text",
            "title": "Mitsubishi",
            "payload": "brand:Mitsubishi",
        }, {
            "content_type": "text",
            "title": "Dihatsu",
            "payload": "brand:Dihatsu",
        }, {
            "content_type": "text",
            "title": "Nissan",
            "payload": "brand:Nissan",
        }]
    };
    callSend(sender_psid, response);
}
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
                        "payload": "Toyota:Toyota Mark 2,2000model,2.0cc, Regalia",
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
                        "payload": "Toyota:Toyota Brevis 2001,3.0cc",
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
                        "payload": "Toyota:Toyota Belta 2009",
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
                        "payload": "Toyota:2007 Toyota Ractics",
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
                        "payload": "Toyota:Toyota Hilux surf 1999 SSR G",
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
                        "payload": "Toyota:Toyota Parado 1997,TX package",
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
                        "payload": "Toyota:2004 late Toyota Hilux Surf",
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
                        "payload": "Toyota:Toyota Harrier 1999 G Package",
                    }]
                }]
            }
        }
    };
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
        "text": "To test text reply, type 'text'"
    };
    let response2 = {
        "text": "To test quick reply, type 'quick'"
    };
    let response3 = {
        "text": "To test button reply, type 'button'"
    };
    let response4 = {
        "text": "To test webview, type 'webview'"
    };
    callSend(sender_psid, response1).then(() => {
        return callSend(sender_psid, response2).then(() => {
            return callSend(sender_psid, response3).then(() => {
                return callSend(sender_psid, response4);
            });
        });
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
                "title": "View My Tasks",
                "payload": "view-tasks"
            }, {
                "type": "postback",
                "title": "Add New Task",
                "payload": "add-task"
            }, {
                "type": "postback",
                "title": "Cancel",
                "payload": "cancel"
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