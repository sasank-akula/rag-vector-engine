namespace com.ai;

using {
    cuid,
    managed
} from '@sap/cds/common';

entity Conversation {
    key cID              : UUID not null;
        userID           : String;
        creation_time    : Timestamp;
        last_update_time : Timestamp;
        title            : String;
        to_messages      : Composition of many Message
                               on to_messages.cID = $self;
}

entity Message {
    key cID           : Association to Conversation;
    key mID           : UUID not null;
        role          : String;
        content       : LargeString;
        creation_time : Timestamp;
}

entity DocumentChunk : cuid, managed {
    text_chunk      : LargeString;
    metadata_column : LargeString;
    embedding       : Vector(1536);
    document        : Association to SyncTable;
    documentID      : Association to DocumentFiles;
    scrapdataID     : Association to ScrapedData;
}

entity DocumentFiles : cuid, managed {
    content   : LargeString;

    @Core.IsMediaType: true
    mediaType : String;
    fileName  : String;
    size      : String;
    chunkID   : Composition of many DocumentChunk
                    on chunkID.documentID = $self;
}

entity SyncTable : managed {
    key pageId  : String;
        title   : String;
        version : Integer;
        chuncks : Composition of many DocumentChunk
                      on chuncks.document = $self;
}

entity ScrapedData : cuid, managed {
    title   : String;
    url     : String;
    chunkID : Composition of many DocumentChunk
                  on chunkID.scrapdataID = $self;
}
