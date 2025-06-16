import mongoose, { Schema, model, connect } from "mongoose";
import { sha256 } from "js-sha256";

export async function connectToDatabase() {
    await connect("mongodb+srv://" + process.env.MONGO_SERVER_USERNAME + ":" + process.env.MONGO_SERVER_PASSWORD + "@bobapp1.gokv8.mongodb.net/BOR?retryWrites=true&w=majority");
}

export interface Person {
    _id?: string,
    name: string,
}

export interface LoginResult {
    type: string,
    person: Person | undefined
}

export interface Credentials  {
    displayName: string,
    externalId: string,
    federatedId: string,
    _id?: string
}

const credentialSchema = new Schema<Credentials>({
    displayName: String,
    externalId: String,
    federatedId: String,
})

export const CredentialModel = model("credential", credentialSchema);



const personSchema = new Schema<Person>({
    name: String,
})

export const PersonModel = model("Person", personSchema);

export const simUsers: Person[] = [
    {
        name: "Chris",
    },
    {
        name: "Ben",
    },
    {
        name: "Matt",
    },
    {
        name: "Ed",
    }

]



export class DB {
    static async addDefaultPeople() {
        // let personModel = model("Person", personSchema);
        return await PersonModel.insertMany(simUsers);
    }
    
    static hashCode(toHash: string): string {
        return sha256(toHash);
    }
    static async countPeople() {
        return await PersonModel.countDocuments();
    }
    

    static async findOrRegister(userId: string, displayName: string) {
        //Find this person in the federated credentials table
        const credentialsResult = await CredentialModel.findOne({externalId: userId});

        // If they're not there, create a new credentials entry and a new person
        if (!credentialsResult){
            const createdPerson = await PersonModel.create({
                name: displayName,
                mainCampaign: "",
            });
            const credsResult = await CredentialModel.create({displayName: displayName, externalId: userId, federatedId: createdPerson._id});
            return createdPerson;
        } else { // We found them in the credentials table, so use their federated id number
                 // to find them in the people table

            const results = await PersonModel.findById(credentialsResult.federatedId);
            if (!results) { // For some reason, they're in the credentials table but not the people table.
                            // Just make a new person and return it.
                const createdPerson = await PersonModel.create({name: credentialsResult.displayName, mainCampaign: ""});
                return createdPerson;
            } else { // We found them in the people table; return what we found.
                return results;
            }
         }
        
        

    }

    static async findPersonByName(name: string) {
        const results = await PersonModel.findOne({name: name});
        return results;
    }

    static async getPerson(id: string) {
        const results = await PersonModel.findById(id);
        return results;
    }
    
}
