const axios = require('axios');

const getDsaAccounts = async () => {
    const dsa_accounts = []; // to store the dsa accounts

    // maps dsa accounts' owner to the dsa account
    let dsa_accounts_map = new Map();

    // variable used for pagenation.. stores the last fetched id inorder to get the next page in the next iteration of the while loop
    var pagenation_variable = ``;

    // get dsa accounts and the owner of the dsa account by tracking the logAccountCreateds event in the InstaIndex Contract
    while (1) {
        const result = await axios.post(
            'https://api.thegraph.com/subgraphs/name/croooook/dsa-accounts',
            {
                query: `
                {
                    logAccountCreateds(first: 1000, where: {id_gt:"`+ pagenation_variable + `"}){
                        id
                        sender
                        owner
                        account
                    }
                }
            `
            }
        );

        // break out of the loop if the object returns an array with length = 0 
        // since this page has no elements, no need to check for further pages
        if (Object.values(result.data.data.logAccountCreateds).length === 0) break;

        // store the object returned into an array in order to traverse the results
        accounts_created = Object.values(result.data.data.logAccountCreateds);


        /*
        loop through the returned results in order to: 
        1. Fill in the map containing the dsa accounts 
        2. To map the dsa account owner to the dsa account
        */

        for (var i = 0; i < accounts_created.length; i++) {
            dsa_accounts.push(accounts_created[i].account);
            dsa_accounts_map.set(accounts_created[i].owner, accounts_created[i].account);
        }

        // stores the last id out of the 1000 entries returned inorder to find the next 1000 results in the next iteration of the while loop
        pagenation_variable = result.data.data.logAccountCreateds[Object.values(result.data.data.logAccountCreateds).length - 1].id;
    }

    return dsa_accounts;
}

module.exports = { getDsaAccounts };