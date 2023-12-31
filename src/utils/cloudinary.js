import { v2 as cloudinary } from "cloudinary";
import fs from "fs";


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


async function uploadCloudinary(localFilePath,type){
    
    try {
        if(!localFilePath) return null;
        let response;
        if(type==="image"){
            response = await cloudinary.uploader.upload(
                localFilePath,
                {
                    resource_type:"image",
                    folder: 'udemy',
                    width: 250,
                    height: 250,
                    gravity: 'faces',
                    crop: 'fill'
                }
            );
            
        }else{
            response = await cloudinary.uploader.upload(
                localFilePath,
                {resource_type:"video"}
            );

        }

        fs.unlinkSync(localFilePath);

        return response;

    } catch (error) {
        console.log(error)
        fs.unlinkSync(localFilePath);

        return null ;

    }
}

export {
    cloudinary,
    uploadCloudinary
}