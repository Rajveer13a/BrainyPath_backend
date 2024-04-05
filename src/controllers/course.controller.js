import tryCatch from "../utils/tryCatch.js";
import Instructor from "../models/instructor.model.js";
import Course from "../models/course.model.js";
import apiError from "../utils/apiError.js";
import apiResponse from "../utils/apiResponse.js";
import { cloudinary, uploadCloudinary } from "../utils/cloudinary.js";
import { thumbnailImgConfig } from "../constants.js";
import Section from "../models/courseSection.model.js";
import Lecture from "../models/sectionLecture.model.js";
import mongoose from "mongoose";
import Review from "../models/courseReview.model.js";

async function addNewResourceToLecture(req,type){
    const instructor = req.instructor;

    let lectureResource = req.file?.path;
    
    const {lecture_id} =  req.params;

    if(
        [ lectureResource, lecture_id ].some(
            (value)=> value===undefined || value?.trim()==="")
    ){
        apiError(400,"all fields are required");
    };

    const lecture = await Lecture.findOne(
        {
            instructor_id: instructor._id,
            _id: lecture_id
        }
    );

    if(!lecture) apiError(400,"lecture not found");

    lectureResource = await uploadCloudinary(
        lectureResource,
        type,

    );
    
    if(!lectureResource) apiError(400," falied to upload lecture video");
    
    if(lecture.resource?.public_id){

        const dest = await cloudinary.uploader.destroy(lecture.resource.public_id,{ resource_type:lecture.type });

        if(dest.result ==="not found") apiError(400,"failed to destroy");
    }
    
    lecture.resource={
        public_id: lectureResource.public_id,
        secure_url: lectureResource.secure_url
    };

    lecture.type = type ;

    await lecture.save();

    return lecture;
}
//-------------------------------------

const createCourse = tryCatch(
    async (req,res)=>{
        let user = req.user;

        const {title, price, description} = req.body;

        const thumbnail = req.file?.path;

        if(
            [title, price, description, thumbnail].some(
                (value)=> value===undefined || value?.trim()==="")
        ){
            apiError(400,"all fields are required");
        };

        const instructor = req.instructor;
        
        const course = await Course.create(
            {
                title,
                price,
                description,
                instructor_id:instructor._id,
                thumbnail:{
                    public_id: "null",
                    secure_url: "null"
                }
            }
        );

        const thumbnial_image = await uploadCloudinary(thumbnail, "image", thumbnailImgConfig);

        if(!thumbnial_image) apiError("failed to upload thumbnial");

        course.thumbnail = {
            public_id: thumbnial_image.public_id,
            secure_url: thumbnial_image.secure_url
        };

        await course.save();

        res.status(200).json(
            new apiResponse("course created successfully", course)
        );
        
        return;
        

        
    }
);

//-------------------------------------

const createSection = tryCatch(
    async (req,res)=>{
        const user = req.user;

        const {course_id} = req.params;
        
        const {title} = req.body;
        
        if(
            [title,course_id].some(
                (value)=> value===undefined || value?.trim()==="")
        ){
            apiError(400,"all values are not given");
        } ;

        const instructor = req.instructor;

        const course = await Course.findOne({
            instructor_id: instructor._id,
            _id:course_id
        })

        if(!course) apiError(400,"course not found");

        const section = await Section.create(
            {
                title,
                course_id: course._id,
                instructor_id: instructor._id
            }
        );

        if(!section) apiError(400,"failed to create section");

        res.status(200).json(
            new apiResponse("section  created successfully",section)
        )
        
    }
)

//-------------------------------------

const addLecturetitle = tryCatch(
    async (req,res)=>{
        
        const instructor = req.instructor;
        
        const {title} = req.body;
        
        const {given_course_id, given_section_id} = req.params;

        if(
            [ title, given_course_id, given_section_id].some(
                (value)=> value===undefined || value?.trim()==="")
        ){
            apiError(400,"all fields are required");
        };
        
        const section = await Section.findOne(
            {
                _id: given_section_id,
                course_id: given_course_id,
                instructor_id: instructor._id
            }
        );

        if(!section) apiError(400,"section not found");
                            
        const lecture = await Lecture.create(
            {
                title,
                instructor_id: instructor._id,
                section_id: section._id                
            }
        );

        if(!lecture) apiError(400,"failed to create lecture");

        res.status(200).json(
            new apiResponse("lecture created successfully",lecture)
        );

        return
    }
);

//-------------------------------------

const addVideoToLecture = tryCatch( 
    async(req,res)=>{
        
        const lecture = await addNewResourceToLecture(req, "video")
        

        res.status(200).json(
            new apiResponse("lecture video added successfully",lecture)
        );

        return;

    }
)

//-------------------------------------

const addfileTOLecture = tryCatch(
    async (req,res)=>{
        
        const lecture = await addNewResourceToLecture(req, "raw");

        res.status(200).json(
            new apiResponse("lecture document added successfully",lecture)
        );

        return;
        
    }
)

//-------------------------------------

const updateLectureTitle = tryCatch(
    async(req, res)=>{
        
        const instructor = req.instructor;
        
        const {title} = req.body;

        const {lecture_id} = req.params;

        if( [ title, lecture_id].some(
            value => value === undefined ||
            value?.trim() === "") 
        ){
            apiError(400,"all fields are required");
        };

        const lecture = await Lecture.findOneAndUpdate(
            {
                _id: lecture_id,
                instructor_id: instructor._id
            },
            {
                title: title
            },
            {
                new:true
            }
        );

        if(!lecture) apiError(400,"lecture not found failed to update titl;e");

        res.status(200).json(
            new apiResponse("title changed successfulyy", lecture)
        );
        
        return;

    }
);

//-------------------------------------

const updateSecitonTitle = tryCatch(
    async(req,res)=>{
        const instructor = req.instructor;
        
        const {title} = req.body;

        const {section_id} = req.params;

        if( [ title, section_id].some(
            value => value === undefined ||
            value?.trim() === "") 
        ){
            apiError(400,"all fields are required");
        };

        const section = await Section.findOneAndUpdate(
            {
                _id: section_id,
                instructor_id: instructor._id
            },
            {
                title: title
            },
            {
                new:true
            }
        );

        if(!section) apiError(400,"section not found failed to update titl;e");

        res.status(200).json(
            new apiResponse("title changed successfulyy", section)
        );
        
        return;

    }
);

//-------------------------------------

const updateCourseDetails = tryCatch(
    async (req, res)=>{

        const { price, description,title } = req.body;

        const { course_id } = req.params;

        let thumbnail = req.file?.path;

        const fields = {
            price: price,
            description: description,
            title: title
        };

        const givenFields = Object.keys(fields).filter(
            value=> fields[value]!==undefined ||
                    fields[value]?.trim()===""
        )

        if( givenFields.length ===0 && !thumbnail ) {
            apiError(400,"no field is given to update");
        };
        
        const course = await Course.findOne(
            {
                _id: course_id,
                instructor_id: req.instructor._id
            }
        );
            
        if(!course) apiError(400,"course not found");
        
        if( thumbnail){//change thumbnail

           const dest = await cloudinary.uploader.destroy(
                course.thumbnail.public_id,
            );

            if(dest.result ==="not found"){
                apiError(400,"failed to delete previous thumbnail")
            };

            thumbnail = await uploadCloudinary(thumbnail,"image", thumbnailImgConfig);

            if(!thumbnail) apiError(400,"failed to upload new thumbnail");

            course.thumbnail = {
                public_id: thumbnail.public_id,
                secure_url: thumbnail.secure_url
            };


        };

        //adding user given field 
        givenFields.forEach(
            ( value ) => {
                course[value] = fields[value]; 
            }
        );        
           
        await course.save();
            
        res.status(200).json(
            new apiResponse("course updated succesfully",course)
        )

        return;

    }
)

//-------------------------------------

const deleteLecture = tryCatch(
    async( req, res )=>{

        const { lecture_id } =  req.params;

        if( lecture_id===undefined || lecture_id.trim()==="" ){
            apiError(400,"lecture id not given");
        };

        const lecture = await Lecture.findOne(
            {
                instructor_id: req.instructor._id,
                _id: lecture_id
            }
        );

        if( !lecture ) apiError(400,"lecture not found");

        if(lecture.resource?.public_id){//deleting lecture resource
            
            const { public_id } = lecture.resource;
            
            const dest = await cloudinary.uploader.destroy(
                public_id,
                { resource_type : lecture.type }

            );

            if(dest.result ==="not found") apiError(400,"failed to destroy");
        }

        const deletingLecture = await Lecture.findByIdAndDelete(
            lecture._id
        );

        if( ! deleteLecture ) apiError(400," failed to delete lecture");

        res.status(200).json(
            new apiResponse("lecture deleted successfully")
        );

        return;

        

    }
);

//-------------------------------------

const deleteSection = tryCatch(
    async(req, res)=>{

        const {section_id} = req.params;

        if( !section_id || section_id.trim()==="" ) apiError(400, "section id is not given");

        const section = await Section.findOne(
            {
                instructor_id: req.instructor._id,
                _id: section_id
            }
        );

        if( !section ) apiError(400," section not found");

        const lecture = await Lecture.find(
            {
                section_id: section._id
            }
        );

        if( lecture.length !==0 ){
            apiError(400,"first delete all lectures of the section")
        };

        const deletingSection = await Section.findByIdAndDelete(
            section._id
        )

        if( ! deletingSection){
            apiError(400,"failed to delete lecture");
        };

        res.status(200).json(
            new apiResponse("section deleted successfully")
        )

        return;

    }
)

const deleteCourse = tryCatch(
    async (req, res)=>{
        const {course_id} = req.params;

        if( !course_id || course_id.trim()==="" ) apiError(400, "course id is not given");

        const course = await Course.findOne(
            {
                instructor_id: req.instructor._id,
                _id: course_id
            }
        );

        if( !course ) apiError(400," course not found");

        const section = await Section.find(
            {
                course_id: course._id
            }
        );

        if( section.length !==0 ){
            apiError(400,"first delete all section of the course")
        };

        //deleting thumbnail of the course

        const delThumbnial = await cloudinary.uploader.destroy(
            course.thumbnail.public_id,
            { resource_type : "image" }
        );

        if(delThumbnial.result ==="not found") apiError(400,"failed to destroy");

        const deletingCourse = await Course.findByIdAndDelete(
            course._id
        )

        if( ! deletingCourse){
            apiError(400,"failed to delete course");
        };

        res.status(200).json(
            new apiResponse("course deleted successfully")
        )

        return;
    }
)

//-------------------------------------

const getCourseDetail = tryCatch(
    async (req, res)=>{

        const { course_id } = req.params;

        if( course_id === undefined || course_id.trim()==" " ){
            apiError(400,"course id not provided");
        };

        const course = await Course.aggregate([
            {
              $match: {
                instructor_id: req.instructor._id,
                _id: new mongoose.Types.ObjectId(course_id)
              }
            },
            {
              $lookup: {
                from: "sections",
                localField: "_id",
                foreignField: "course_id",
                as: "sections",
                pipeline: [
                  {
                    $sort: {
                      createdAt: 1 
                    }
                  },
                  {
                    $lookup: {
                      from: "lectures",
                      localField: "_id",
                      foreignField: "section_id",
                      as: "lectures",
                      pipeline: [
                        {
                          $sort: {
                            createdAt: 1 
                          }
                        }
                      ]
                    }
                  },
                  {
                    $project:{
                        lectures : {
                            section_id : 0,
                            createdAt : 0,
                            updatedAt : 0,
                            __v : 0,
                            instructor_id : 0
                        }
                    }
                  }
                  
                ]
              }
            },
            {
                $project:{
                    __v : 0,
                    sections : {
                        __v : 0,
                        createdAt : 0,
                        updatedAt : 0,
                        course_id : 0,
                        instructor_id : 0
                    }

                }
            }
          ]);
          

        if( course.length === 0 ) apiError(400,"course not found");

        res.status(200).json(
            new apiResponse("course data fetched successfully", course[0])
        )
    }
)

//-------------------------------------

const submitForApproval =tryCatch(
    async(req,res)=>{

        const instructor = req.instructor;

        const { course_id } = req.body;

        if( course_id === undefined || course_id.trim() ===""){
            apiError(400,"course_id not given");
        };

        const course = await Course.findOne(
            {
                _id: course_id,
                instructor_id: instructor._id
            }
        );

        if(!course) apiError(400,"course not found");
                
        const approval = await Review.create(
            {
                course_id: course._id,
                instructorName: req.user.username
            }
        );

        if(  !approval ) apiError(
            400, "failed to submit for approval"
        );

        res.status(200).json(
            new apiResponse("submitted for approval")
        );

        

    }
);


const approvalStatus = tryCatch(
    async(req, res)=>{
        
        const { course_id } = req.body;
        
        if( course_id === undefined || course_id.trim() === "" ){
            apiError(400,"course id not given");
        };

        const course = await Course.findOne({
            _id: course_id,
            instructor_id: new mongoose.Types.ObjectId(req.instructor._id)
        });

        if(!course) apiError(400, "course not found");

        const approvalStatus = await Review.findOne({
            course_id: course_id
        })

        if( !approvalStatus ) apiError(400, "failed to get approval status");

        res.status(200).json(
            new apiResponse(
                "approval status fetched successfully",
                {
                    reviewed: approvalStatus.reviewed,
                    feedback: approvalStatus?.feedback
                }
            )
        );



    }
)



//-------------------------------------
export{
    createCourse,
    createSection,
    addLecturetitle,
    addVideoToLecture,
    addfileTOLecture,
    updateLectureTitle,
    updateSecitonTitle,
    updateCourseDetails,
    deleteLecture,
    deleteSection,
    deleteCourse,
    getCourseDetail,
    submitForApproval,
    approvalStatus
};