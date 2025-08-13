const cds = require('@sap/cds')
const { transformResponseToHTML }= require('./markdownToHtml');

const tableName = 'COM_AI_DOCUMENTCHUNK'
const embeddingColumn = 'EMBEDDING'
const contentColumn = 'TEXT_CHUNK'
const userQuery = 'In which city are Thomas Jung and Rich Heilman on April, 19th 2024?'
const instructions = 'Return the result in json format. Display the keys, the topic and the city in a table form.'

const { storeRetrieveMessages, storeModelResponse } = require('./memory-helper');
const { DELETE } = require('@sap/cds/lib/ql/cds-ql')

const altUserQuery = 'Who is joining the event in Madrid Spain?'
const altInstructions = 'Return the result in json format. Display the name.'

const ragPrompt = `You are an AI assistant that answers strictly from the provided document context. Always base answers only on the provided document chunks. If the answer isn’t in the documents, clearly state this and ask before using general knowledge. When using general knowledge (with consent), relate it back to the document context. Combine information from multiple chunks if needed for a complete answer. If found → give a complete, document-based answer. If not found → state this, request permission, then proceed if approved.
`;

module.exports = function () {

    this.on('getChatRagResponse', async (req) => {
        try {
            //request input data
            const { conversationId, messageId, message_time, user_id, user_query } = req.data;
            console.log(conversationId)
            const { Conversation, Message } = this.entities;
            const capllmplugin = await cds.connect.to("cap-llm-plugin");
            console.log("***********************************************************************************************\n");
            console.log(`Received the request for RAG retrieval for the user query : ${user_query}\n`);
         
            //set the modeName you want
            const chatModelName = "gpt-4";
            const embeddingModelName = "text-embedding-ada-002";

            console.log(`Leveraing the following LLMs \n Chat Model:  gpt-4 \n Embedding Model: text-embedding-ada-002\n`);
            //Optional. handle memory before the RAG LLM call
            const memoryContext = await storeRetrieveMessages(conversationId, messageId, message_time, user_id, user_query, Conversation, Message, chatModelName);

            //Obtain the model configs configured in package.json
            const chatModelConfig = cds.env.requires["GENERATIVE_AI_HUB"][chatModelName];
            const embeddingModelConfig = cds.env.requires["GENERATIVE_AI_HUB"][embeddingModelName];

            
            console.log("Getting the RAG retrival response from the CAP LLM Plugin!");

            const chatRagResponse = await capllmplugin.getRagResponseWithConfig(
                user_query, //user query
                tableName,   //table name containing the embeddings
                embeddingColumn, //column in the table containing the vector embeddings
                contentColumn, //  column in the table containing the actual content
                ragPrompt, // system prompt for the task
                embeddingModelConfig, //embedding model config
                chatModelConfig, //chat model config
                memoryContext.length > 0 ? memoryContext : undefined, //Optional.conversation memory context to be used.
                5  //Optional. topK similarity search results to be fetched. Defaults to 5
            );

            //parse the response object according to the respective model for your use case. For instance, lets consider the following three models.
            let chatCompletionResponse = null;
            if (chatModelName === "gpt-4") {
                chatCompletionResponse =
                {
                    "role": chatRagResponse.completion.choices[0].message.role,
                    "content": chatRagResponse.completion.choices[0].message.content
                }
            }

            //Optional. parse other model outputs if you choose to use a different model.
            else {
                throw new Error("The model supported in this application is 'gpt-4'. Please customize this application to use any model supported by CAP LLM Plugin. Please make the customization by referring to the comments.")
            }
            //Optional. handle memory after the RAG LLM call
            const responseTimestamp = new Date().toISOString();
            await storeModelResponse(conversationId, responseTimestamp, chatCompletionResponse, Message, Conversation);

           const cleanHTML= await transformResponseToHTML(chatCompletionResponse.content)
           
            //build the response payload for the frontend.
            const response = {
                "role": chatCompletionResponse.role,
                "content": cleanHTML,
                "messageTime": responseTimestamp,

            };
            console.log(response)



            return response;
        }
        catch (error) {
            // Handle any errors that occur during the execution
            console.log('Error while generating response for user query:', error);
            throw error;
        }
    })
    this.on('getRagResponse', async (req) => {
        try {
            const question = req.data.question || " "
            const vectorplugin = await cds.connect.to('cap-llm-plugin')


            const chatModelName = "gpt-4";
            const embeddingModelName = "text-embedding-ada-002";
            const embeddingModelConfig = cds.env.requires["GENERATIVE_AI_HUB"][embeddingModelName];
            const chatModelConfig = cds.env.requires["GENERATIVE_AI_HUB"][chatModelName];
            // const embeddingResult = await capllmplugin.getEmbeddingWithConfig(embeddingModelConfig, user_query);
            // const embedding = embeddingResult?.data[0]?.embedding;


            const chatRagResponse = await vectorplugin.getRagResponseWithConfig(
                question,  //user query
                tableName,   //table name containing the embeddings
                embeddingColumn, //column in the table containing the vector embeddings
                contentColumn, //  column in the table containing the actual content
                ragPrompt, // system prompt for the task
                embeddingModelConfig, //embedding model config
                chatModelConfig, //chat model config
            );

            let chatCompletionResponse = null;
            if (chatModelName === "gpt-4") {
                chatCompletionResponse =
                {
                    "role": chatRagResponse.completion.choices[0].message.role,
                    "content": chatRagResponse.completion.choices[0].message.content
                }
            }
            //Optional. parse other model outputs if you choose to use a different model.
            else {
                throw new Error("The model supported in this application is 'gpt-4'. Please customize this application to use any model supported by CAP LLM Plugin. Please make the customization by referring to the comments.")
            }
            //Optional. handle memory after the RAG LLM call
            // const responseTimestamp = new Date().toISOString();
            // await storeModelResponse(conversationId, responseTimestamp, chatCompletionResponse, Message, Conversation);

            //build the r esponse payload for the frontend.
            const response = {
                "role": chatCompletionResponse.role,
                "content": chatCompletionResponse.content,
                // "additionalContents": chatRagResponse.additionalContents,
            };

            return response;

           
        } catch (error) {
            console.log('Error while generating response for user query:', error)
            throw error;
        }
    })

    this.on('executeSimilaritySearch', async () => {
        const vectorplugin = await cds.connect.to('cap-llm-plugin')
        const embeddings = await vectorplugin.getEmbedding(userQuery)
        const similaritySearchResults = await vectorplugin.similaritySearch(
            tableName,
            embeddingColumn,
            contentColumn,
            embeddings,
            'L2DISTANCE',
            3
        )
        return similaritySearchResults
    })
    this.on('deleteChatData', async () => {
        try {
            const { Conversation, Message } = this.entities;
            await DELETE.from(Conversation);
            await DELETE.from(Message);
            return "Success!"
        }
        catch (error) {
            // Handle any errors that occur during the execution
            console.log('Error while deleting the chat content in db:', error);
            throw error;
        }
    })
}