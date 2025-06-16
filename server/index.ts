import express, { NextFunction, Request, Response, Express } from "express";
import bodyParser from "body-parser";
import session,  { SessionData } from "express-session";
import MongoStore from "connect-mongo";
import cors from "cors";
import { expressCspHeader, SELF, INLINE, NONE } from "express-csp-header";
import dotenv from "dotenv";
import { HydratedDocument } from "mongoose";
import { ConfigParams, auth, requiresAuth } from "express-openid-connect";
import { decode, Jwt } from "jsonwebtoken";

import { DB, Person, LoginResult } from "./database";


declare module "express-session" {
    interface SessionData {
        personId: string,
        auth0_id_token: Jwt
    }
}


async function startServer(){

    dotenv.config();
    const PORT = Number(process.env.PORT);


    const appFolder = "../client/bitdapp/dist/bitdapp/browser";
    const staticFolder = "../client/login/bitdlogin/dist/bitdlogin/browser";
    const staticOptions = {
        dotfiles: "ignore",
        extensions: ["html", "js", "scss", "css"],
        redirect: true
    }




    const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:4200",
        "http://192.168.99.137:3000",
        "http://192.168.99.137:80",
        "http://192.168.99.147:3000",
        "http://192.168.66.113:3000",
        "wss://*.ably.io/", 
        "https://*.ably.io/", 
        "wss://*.realtime.ably.io/", 
        "wss://*.ably-realtime.com",
        "https://*.ably-realtime.com",
        "https://ably-realtime.com",
        "https://*.auth0.com"
    ]

    const options: cors.CorsOptions = {
        origin: allowedOrigins
    }
    const app = express();


    app.use(session({
        secret: process.env.EXPRESS_SECRET!,
        store: MongoStore.create({mongoUrl: "mongodb+srv://" + process.env.MONGO_SERVER_USERNAME + ":" + process.env.MONGO_SERVER_PASSWORD + "@bobapp1.gokv8.mongodb.net/BOR?retryWrites=true&w=majority"}),
        unset: "destroy",
        cookie: {
        maxAge: 1000 * 60 *60 * 24
        }
    }))

    // app.use(cors(options));
    app.use(expressCspHeader({
        directives: {
            'default-src': [SELF, INLINE, "https://fonts.gstatic.com" ].concat(allowedOrigins),
            'connect-src': [SELF, INLINE, "https://fonts.gstatic.com" ].concat(allowedOrigins),
            'script-src': [SELF, INLINE].concat(allowedOrigins),
            'style-src': [SELF, INLINE, "https://fonts.googleapis.com"].concat(allowedOrigins),
            'img-src': [SELF, INLINE, "https://storage.googleapis.com"].concat(allowedOrigins),
            'worker-src': [NONE]
            }
    }));






    app.use(bodyParser.json());



    const openidConfig: ConfigParams = {
    authRequired: true,
    auth0Logout: true,
    // baseURL: "https://rome.dails.net",
      baseURL: "http://localhost:3000",
    clientID: process.env.AUTH0_CLIENT_ID,
    issuerBaseURL: "https://dev-vvtgwjm3mq5pr748.us.auth0.com",
    secret: process.env.EXPRESS_SECRET,
    authorizationParams: {
        scope: "openid name email profile",
    }
    };

    app.use(auth(openidConfig));
    
    app.use("/api", async (req, res, next) => {
        // console.log("Checking authorization");
        if (!req.session.personId) {
            console.log("Not authorized");
            res.sendStatus(304);
        } else {
            // console.log("Authorized as " + req.session.personId);
            next();  
        }
    })



    app.get("/api/get/idtoken", async (req, res) => {
        console.log("Returning id token " + JSON.stringify(req.session.auth0_id_token));
        res.json(req.session.auth0_id_token);
    })

    app.get("/api/logout", async (req, res) => {
    console.log("Logging out")
    req.session.personId = undefined;
    const auth0_id_token = JSON.stringify(req.session.auth0_id_token);
    console.log("Session:");
    console.log(req.session);
    req.session.destroy((err) => {
        if (err) {
            console.log("Destroy error:");
            console.log(err);
            return res.redirect("/logout");
        } else {
            console.log("Destroyed.");
            // return res.oidc.logout();
            // fetch('https://dev-vvtgwjm3mq5pr748.us.auth0.com/oidc/logout?id_token_hint=' + auth0_id_token + '&post_logout_redirect_uri=https://rome.dails.net/login', {
            //   headers: {
            //     'content-type': 'application/x-www-form-urlencoded'
            //   }
            // });
            //return res.redirect('https://dev-vvtgwjm3mq5pr748.us.auth0.com/oidc/logout?id_token_hint=' + auth0_id_token + '&post_logout_redirect_uri=https://rome.dails.net/login');
            return res.status(200).json(auth0_id_token);
        }
    });
    });


    app.get("/", async (req: Request, res: Response, next: NextFunction) => {
        console.log("In verify function");
        
        console.log("isAuthenticated: " + req.oidc.isAuthenticated());
        console.log("User: " + JSON.stringify(req.oidc?.user));
        if (req.oidc.isAuthenticated() && req.oidc.user) {
            console.log("In authenticated section");

            if (req.oidc.idToken){
            const jot = decode(req.oidc.idToken, {complete: true});
            if (jot) {
                req.session.auth0_id_token = jot;
            }
            
            }

            let userInfo = req.oidc.user;
            console.log("Got user info:");
            console.log(JSON.stringify(userInfo));
            const userId = userInfo.sub;
            const displayName = userInfo.given_name || "NoName";
            const loggedInPerson = await DB.findOrRegister(userId, displayName);
            console.log("Got DB response");
            if (loggedInPerson) {
                console.log("Found person");
                console.log(JSON.stringify(loggedInPerson));
                // I KNOW I KNOW I KNOW I'm reinventing Promises.
                // did you wake me up?
                // did you rub my lamp?
                // you're getting your json, so SIDDOWN
                req.session.personId = loggedInPerson._id;
                const result: LoginResult = {
                    type: "success",
                    person: loggedInPerson
                }
                console.log(result);
                res.sendFile(`/`, {root: appFolder});
                // return res.redirect("/");
                // return res.json(result);
            } else {
                console.log("No logged in person???");
                res.sendStatus(404);
            }
        } else {
            console.log("Not authenticated");
            res.status(304).json("Not authenticated");
        }
            // return res.redirect("/signin/index.html");

        
        // res.sendFile(`/`, {root: appFolder});
        
    });
    app.use(express.static(appFolder, staticOptions))
    // app.use("/signin", express.static(staticFolder, staticOptions))

    app.all("*", async (req, res) => {
        res.status(200).sendFile(`/`, {root: appFolder});
    })


    app.listen(PORT,() => {
        console.log("Starting server");
        console.log("Server running at PORT: ", PORT);
        
    }).on("error", (error) => {
        // throw new Error(error.name);
    });
}
startServer();
