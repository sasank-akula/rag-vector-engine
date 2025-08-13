const cds = require('@sap/cds')
const { INSERT, DELETE, SELECT } = cds.ql
const { PDFLoader } = require('langchain/document_loaders/fs/pdf');
const { TextLoader } = require('langchain/document_loaders/fs/text')
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter')
const path = require('path')
const fs = require('fs');
const { throwDeprecation } = require('process');  
// Helper method to convert embeddings to buffer for insertion
let array2VectorBuffer = (data) => {
  const sizeFloat = 4
  const sizeDimensions = 4
  const bufferSize = data.length * sizeFloat + sizeDimensions

  const buffer = Buffer.allocUnsafe(bufferSize)
  // write size into buffer
  buffer.writeUInt32LE(data.length, 0)
  data.forEach((value, index) => {
    buffer.writeFloatLE(value, index * sizeFloat + sizeDimensions);
  })
  return buffer
}

// Helper method to delete file if it already exists
let deleteIfExists = (filePath) => {
    try {
        fs.unlink(filePath, (err) => {
        if (err) {
            if (err.code === 'ENOENT') {
            console.log('File does not exist')
            } else {
            console.error('Error deleting file:', err)
            }
        } else {
            console.log('File deleted successfully')
        }
        })
    } catch (unlinkErr) {
        console.error('Error occurred while attempting to delete file:', unlinkErr)
    }
}

module.exports = function() {
  this.on('deleteFiles',async(req)=>{
    const {DocumentFiles,DocumentChunk} = this.entities;
    await DELETE.from(DocumentFiles)
    return "Success"
})

  this.after('CREATE','DocumentFiles',async(result,req)=>{
    try{
      const ID=result.ID;
      await this.storeEmbeddings({documentID:ID});
      return "Document Stored SuccessFully"
    }
    catch(error){
      console.log("error : ",error)
      throw new Error("Error while storing embiddings  ")
    }
  });
  this.on('storeEmbeddings', async (req) => {
    try {
      const {documentID} =req.data
      const vectorPlugin = await cds.connect.to('cap-llm-plugin')
      const { DocumentFiles,DocumentChunk } = this.entities
      const record= await SELECT.from(DocumentFiles).where({ID:documentID})
      console.log(record)
      const pdfBase64 = record[0].content; 
      const fileName = record[0].fileName;
      if (!pdfBase64) throw new Error("❌ No PDF Base64 provided!");

        // ✅ STEP 1: Convert Base64 → Buffer & Save as Temp File
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const tempDocLocation = path.join(__dirname, fileName);
        fs.writeFileSync(tempDocLocation, pdfBuffer);
        console.log(`📄 Temp PDF saved: ${tempDocLocation}`);

        const loader = new PDFLoader(tempDocLocation);
      let textChunkEntries = []
      const embeddingModelName = "text-embedding-ada-002";
      
      const document = await loader.load()

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000,
        chunkOverlap: 150,
        addStartIndex: true
      })
        
      const textChunks = await splitter.splitDocuments(document)
      console.log(`Documents split into ${textChunks.length} chunks.`)

      console.log("Generating the vector embeddings for the text chunks.")
      // For each text chunk generate the embeddings
      for (const chunk of textChunks) {
        const embeddingModelConfig = cds.env.requires["GENERATIVE_AI_HUB"][embeddingModelName];
        
        const embeddingResult  = await vectorPlugin.getEmbeddingWithConfig(embeddingModelConfig,chunk.pageContent)
        let embedding =null;
        if (embeddingModelName === "text-embedding-ada-002"){
          embedding =  embeddingResult?.data[0]?.embedding;
       }

       else{
         throw new Error(`Embedding model ${embeddingModelName} not supported!\n`)
       }
        const entry = {
          "text_chunk": chunk.pageContent,
          "metadata_column": loader.filePath,
          "embedding": array2VectorBuffer(embedding),
          "documentID_ID":documentID
        }
        console.log(entry)
        textChunkEntries.push(entry)
      }
      
      console.log("Inserting text chunks with embeddings into db.")
      // Insert the text chunk with embeddings into db
      const insertStatus = await INSERT.into(DocumentChunk).entries(textChunkEntries)
      if (!insertStatus) {
        throw new Error("Insertion of text chunks into db failed!")
      }
      deleteIfExists(tempDocLocation);
      console.log(`🗑 Temp file deleted: ${tempDocLocation}`);
      return `Embeddings stored successfully to db.`
    } catch (error) {
      // Handle any errors that occur during the execution
      console.log('Error while generating and storing vector embeddings:', error)
      throw error
    }
})

  this.on ('deleteEmbeddings', async (req) => {
    try {
      // Delete any previous records in the table
      const { DocumentChunk } = this.entities
      await DELETE.from(DocumentChunk)
      return "Success!"
    }
    catch (error) {
      // Handle any errors that occur during the execution
      console.log('Error while deleting the embeddings content in db:', error)
      throw error
    }
  })
}