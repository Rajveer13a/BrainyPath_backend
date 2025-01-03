import apiResponse from "../utils/apiResponse.js";
import tryCatch from "../utils/tryCatch.js"
import apiError from "../utils/apiError.js"
import User from "../models/user.model.js";
import { sendForgotPasswordMail, sendVerifyMail } from "../utils/emailTemplates.js";
import sendEmail from "../utils/sendEmail.js";
import crypto from "crypto";
import { ageCookie, profileImgConfig, randomByteSize } from "../constants.js";
import jwt from "jsonwebtoken";
import { type } from "os";
import { log } from "console";
import { uploadCloudinary, cloudinary } from "../utils/cloudinary.js";
import UserConfig from "../models/user.config.js";
import mongoose from "mongoose";
import Course from "../models/course.model.js";
import Instructor from "../models/instructor.model.js";
import { linkSessionToUser } from "./search.controller.js";

const cookieOptions = {
    httpOnly: false,
    secure: true,
    sameSite: 'None',
    age : ageCookie
}

//___________________________________

const registerUser = tryCatch(
    async (req, res) => {

        const { username, email, password, } = req.body;

        if (
            [username, email, password].some((value) => value?.trim() === "" || value === undefined)
        ) {
            apiError(400, "all fields are required")
        }

        const exist = await User.findOne({ email });

        if (exist) {
            // if (exist.verifiedStatus === true) {
            //     apiError(409, `user with email '${email}' already existed`);
            // }

            // res.status(200).json(
            //     new apiResponse(`user account created , verify email '${email}' to continue`)
            // )
            // return;
            apiError(409, `user with email '${email}' already existed`);

        }

        const user = await User.create({
            username,
            email,
            password,
        })


        if (!user) apiError(400, "failed to create user account, try again later")

        //setting access token
        const jwtAccess = user.generateAccessToken();

        res.cookie('session_token', jwtAccess, cookieOptions)

        res.status(200).json(
            new apiResponse(
                "user account created , verify email to continue",
                {
                    username: user.username,
                    email: user.email,
                    verifiedStatus: user.verifiedStatus,
                    role: user.role,
                    purchasedCourses: user.purchasedCourses
                }
            )
        );

        return;

    }
);

//___________________________________

const emailVerificationToken = tryCatch(
    async (req, res) => {

        const user = req.user; ///comes from auth middleware

        if (user.verifiedStatus === true) apiError(400, "user already verified");

        const tokenexpiry = user?.emailVerificationToken?.expiry;

        // when token is already created
        if (Date.now() <= tokenexpiry) {   //token exist & ! expired 

            if (user.emailVerificationToken.emailLimit === 0) {

                // apiError(
                //     400,
                //     `verifiaction mail send to ${user.email}, if u still can't find it please try after ${tokenexpiry} `
                // )
                res.status(500).json(
                    new apiResponse(`try after cooldown ${tokenexpiry}`, { tokenexpiry }, false)
                )
                return
            };
            //if ratelimit not exceeds
            const verificationToken = user.generateVerificationToken(false);

            await sendVerifyMail(user.email, verificationToken);

            await user.save();

            res.status(200).json(
                new apiResponse(`verification code send to ${user.email} `)
            )
            return;
        };

        // first time creating token
        const verificationToken = user.generateVerificationToken(true);

        await user.save();

        await sendVerifyMail(user.email, verificationToken);

        res.status(200).json(
            new apiResponse(`verification mail send successfully to ${user.email}`)
        )

        return;

    }
)

//___________________________________

const verifyUserAccount = tryCatch(
    async (req, res) => {

        let user = req.user

        if (user.verifiedStatus === true) apiError(400, "user already verified");

        const { token } = req.body;

        // we know our token length is 6
        if (!token || token.trim().length !== 6) apiError(400, "verification token not provided correctly, try again");

        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');


        if ( //token does not match or is expired
            user.emailVerificationToken.token !== hashedToken ||
            user.emailVerificationToken.expiry < Date.now()

        ) {
            apiError(400, "invalid verification token or expired token")

        }

        user.verifiedStatus = true;

        user.emailVerificationToken = undefined;

        user = await user.save();

        const jwtAccess = user.generateAccessToken();
        res.cookie('session_token', jwtAccess, cookieOptions);


        res.status(200).json(
            new apiResponse("User account verified successfully")
        )

        return;



    }
)

//___________________________________

const loginUser = tryCatch(
    async (req, res) => {

        const { email, password } = req.body;

        if ([email, password].some((value) => value?.trim() === "" || value == undefined)) {
            apiError(400, "username and password both required")
        };

        let user = await User.findOne({ email }).select('+password');

        if (!user) apiError(400,"incorrect username or password");

        const isValidPass = await user.isPasswordCorrect(password);

        if (!isValidPass) apiError(400, "incorrect username or password");

        const jwtAccess = user.generateAccessToken();

        const jwtRefresh = user.generateRefreshToken();

        user = await User.findByIdAndUpdate(
            user._id,
            {
                $set: {
                    refreshToken: jwtRefresh
                }
            },
            {
                new: true
            }
        ).select('-emailVerificationToken -forgotPasswordToken');

        res.cookie('session_token', jwtAccess, cookieOptions);

        res.cookie('refresh_token', jwtRefresh, cookieOptions);

        res.status(200).json(
            new apiResponse("user logged in succesfully", user)
        );

        await linkSessionToUser(user._id, req.cookies.trackingId);

        return;




    }
)

//___________________________________

const getProfile = tryCatch(
    async (req, res) => {
        let user = req.user.toObject()

        delete user.emailVerificationToken;
        delete user.forgotPasswordToken;

        const instructorProfile = await Instructor.findOne({
            user_id: user._id
        })

        if (instructorProfile) user = { ...user, ...instructorProfile._doc };

        res.status(200).json(
            new apiResponse("user data fetched", user)
        )
    }
)

//___________________________________

const logoutUser = tryCatch(
    async (req, res) => {

        await User.findByIdAndUpdate(
            req.user._id,
            {
                $unset: {
                    refreshToken: 1
                }
            }
        );

        res.status(200)
            .clearCookie("session_token", cookieOptions)
            .clearCookie("refresh_token", cookieOptions)
            .json(
                new apiResponse("logged out succesfully")
            )
    }
)

//___________________________________

const refreshAccessToken = tryCatch(
    async (req, res) => {

        const { refresh_token: incoming_refreshToken } = req.cookies;

        if (!incoming_refreshToken) apiError(400, "unauthorized access");

        const decodedToken = jwt.verify(incoming_refreshToken, process.env.JWT_TOKEN_SECRET);

        const user = await User.findById(decodedToken._id).select('+refreshToken');

        if (!user) apiError(400, "invalid refresh token");

        if (incoming_refreshToken !== user.refreshToken) {
            apiError(400, "invalid refresh token")
        }

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;

        await user.save();

        res.status(200)
            .cookie('session_token', accessToken, cookieOptions)
            .cookie('refresh_token', refreshToken, cookieOptions)
            .json(
                new apiResponse("access token refreshed successfully")
            );

        return;
    }
)

//___________________________________

const changePassword = tryCatch(
    async (req, res) => {
        const { oldPassword, newPassword } = req.body;

        if (
            [oldPassword, newPassword].some(
                (value) => value?.trim() === "" ||
                    value === undefined
            )
        ) {
            apiError(400, "old passwod and new password both required");
        }

        if (oldPassword === newPassword) {
            apiError(400, "oldpassword and new password both are same!")
        }

        const user = await User.findById(req.user._id).select("+password");

        const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

        if (!isPasswordCorrect) apiError(400, "password does not match");

        user.password = newPassword;

        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;

        await user.save();

        res.cookie("refresh_token", refreshToken, cookieOptions);

        res.status(200).json(
            new apiResponse("password changed successfully")
        )

        return;

    }
)

//___________________________________

const forgotPassword = tryCatch(
    async (req, res) => {

        const { email } = req.body;

        if (email === "" || email === undefined) {
            apiError(400, "email not provided correctly")
        }

        const user = await User.findOne({ email });

        if (!user) apiError(400, "user not found");

        const forgotPasswordToken = user.forgotPasswordToken;

        if (forgotPasswordToken?.expiry > Date.now()) {

            const { expiry, token, emailLimit } = forgotPasswordToken;

            if (emailLimit === 0) {//rate limit exceeds
                res.status(200).json(
                    new apiResponse(`try after cooldown ${forgotPasswordToken?.expiry}`, { tokenexpiry:forgotPasswordToken?.expiry }, false)
                )
                return
            };
            //rate limit not exceeds
            const ForgotPasswordToken = user.generateForgotPasswordToken(false);

            await sendForgotPasswordMail(email, forgotPasswordToken.token);

            await user.save();

            res.status(200).json(
                new apiResponse(
                    `forgot password link send successfully ${email}`
                )
            );

            return;

        };

        const forgotPasstoken = await user.generateForgotPasswordToken(true);

        await sendForgotPasswordMail(email, forgotPasstoken);

        await user.save();

        res.status(200).json(
            new apiResponse(`forgot password link send successfully ${email}`)
        );

        return;

    }
)

//___________________________________

const resetPassword = tryCatch(
    async (req, res) => {

        const { newPassword, token } = req.body;

        if (
            [token, newPassword].some(
                (value) => (value?.trim() === "" ||
                    value === undefined)
            )
        ) {

            apiError(400, "newpassword or token is not send properly");
        };

        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');


        const user = await User.findOne({
            "forgotPasswordToken.token": hashedToken,
            "forgotPasswordToken.expiry": { $gt: Date.now() }
        });

        if (!user) apiError(400, "token invalid or expired");

        user.password = newPassword;

        user.forgotPasswordToken = undefined;

        user.refreshToken = undefined;

        await user.save();

        res.status(200).json(
            new apiResponse("password reset successfully")
        );

        return;

    }
)

//___________________________________

const updateUserAvatarImage = tryCatch(
    async (req, res) => {
        let user = req.user;

        const avatarLocalPath = req.file?.path;

        if (!avatarLocalPath) apiError(400, "avatar file is missing");

        const avatar = await uploadCloudinary(avatarLocalPath, "image", profileImgConfig);

        if (!avatar) apiError(400, "failed to upload avatar");

        if (user.profileImage.public_id) {//if avatar already present 

            const res = await cloudinary.uploader.destroy(
                user.profileImage.public_id
            );

            if (res.result === "not found") apiError(400, "failed to delete previous image")
        }

        user = await User.findByIdAndUpdate(
            user._id,
            {
                $set: {
                    profileImage: {
                        public_id: avatar.public_id,
                        secure_url: avatar.secure_url
                    }
                }
            },
            {
                new: true
            }
        ).select("-forgotPasswordToken");

        await Instructor.findOneAndUpdate({
            user_id: user._id,
            'profileCompleted.status': false
        }, {
            $set: {
                'profileCompleted.step': 3
            }
        })

        res.status(200).json(
            new apiResponse("avatar image updated successfully", user)
        )

        return;

    }
)

//___________________________________

const updateUserDetails = tryCatch(
    async (req, res) => {
        const { username, headline, bio, language, social } = req.body;

        if ([username, headline, bio, language, social].every(value => value == undefined || value?.trim == "")) {
            apiError(400, " no field is given")
        }

        const fieldsToUpdateInstructor = JSON.parse(JSON.stringify({headline, bio, language, social }));

        if (username) {

            const user = await User.findByIdAndUpdate(
                req.user._id,
                {
                    $set: {
                        username: username
                    }
                },
                {
                    new: true
                }
            ).select("-forgotPasswordToken");

            if (!user) apiError(400, "failed to update username");
        }

        if(Object.keys(fieldsToUpdateInstructor).length > 0 ){

            const result = await Instructor.findOneAndUpdate(
                {user_id: req.user._id},
                {$set: fieldsToUpdateInstructor}
            );

            if(!result) apiError(400, "failed to update fields");

        }

        res.status(200).json(
            new apiResponse("user details updated successfully")
        )
    }
)

const userConfig = tryCatch(
    async (req, res) => {

        let config = await UserConfig.findOne({
            user_id: req.user._id
        });

        if (!config) {
            config = await UserConfig.create({
                user_id: req.user._id
            });

        };


        const favouriteList = config.favourite.map((value) => new mongoose.Types.ObjectId(value));
        const cartList = config.cart.map((value) => new mongoose.Types.ObjectId(value));

        const results = await Course.aggregate([
            {
                $facet: {
                    cart: [
                        {
                            $match: {
                                _id: { $in: cartList }
                            }
                        },
                        {
                            $lookup: {
                                from: "instructors",
                                localField: "instructor_id",
                                foreignField: "_id",
                                as: "instructor",
                                pipeline: [
                                    {
                                        $lookup: {
                                            from: "users",
                                            localField: "user_id",
                                            foreignField: "_id",
                                            as: "user"
                                        }
                                    },
                                    {
                                        $unwind: "$user"
                                    },
                                    {
                                        $project: {
                                            username: "$user.username",
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $unwind: "$instructor"
                        }
                    ],
                    favourites: [
                        {
                            $match: {
                                _id: { $in: favouriteList }
                            }
                        },
                        {
                            $lookup: {
                                from: "instructors",
                                localField: "instructor_id",
                                foreignField: "_id",
                                as: "instructor",
                                pipeline: [
                                    {
                                        $lookup: {
                                            from: "users",
                                            localField: "user_id",
                                            foreignField: "_id",
                                            as: "user"
                                        }
                                    },
                                    {
                                        $unwind: "$user"
                                    },
                                    {
                                        $project: {
                                            username: "$user.username",
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $unwind: "$instructor"
                        }
                    ]
                }
            }
        ]);

        const cart = results[0].cart;
        const favourites = results[0].favourites;



        res.status(200).json(
            new apiResponse("config fetched successfully", { cart, favourites })
        )
    }
)

const cart = tryCatch(
    async (req, res) => {

        const { add, remove } = req.query;
        console.log(remove);

        let cart;
        if (mongoose.Types.ObjectId.isValid(remove)) {
            cart = await UserConfig.findOneAndUpdate(
                {
                    user_id: req.user._id
                },
                {
                    $pull: {
                        cart: remove
                    }
                },
                {
                    new: true
                }
            );

        } else if (mongoose.Types.ObjectId.isValid(add)) {
            cart = await UserConfig.findOneAndUpdate(
                {
                    user_id: req.user._id
                },
                {
                    $addToSet: {
                        cart: add
                    }
                },
                {
                    new: true
                }
            )
        };

        if (!cart) apiError(400, "something went wrong");


        const message = add != undefined ? "course added to cart" : "course remove from the cart";

        res.status(200).json(
            new apiResponse(message, cart)
        )



    }
)

const favourite = tryCatch(
    async (req, res) => {

        const { add, remove } = req.query;


        let favourite;
        if (mongoose.Types.ObjectId.isValid(remove)) {
            favourite = await UserConfig.findOneAndUpdate(
                {
                    user_id: req.user._id
                },
                {
                    $pull: {
                        favourite: remove
                    }
                },
                {
                    new: true
                }
            );

        } else if (mongoose.Types.ObjectId.isValid(add)) {
            favourite = await UserConfig.findOneAndUpdate(
                {
                    user_id: req.user._id
                },
                {
                    $addToSet: {
                        favourite: add
                    }
                },
                {
                    new: true
                }
            )
        };

        if (!favourite) apiError(400, "something went wrong");

        res.status(200).json(
            new apiResponse("updated succesfully", favourite)
        )



    }
)


export {
    registerUser,
    emailVerificationToken,
    verifyUserAccount,
    loginUser,
    getProfile,
    logoutUser,
    refreshAccessToken,
    changePassword,
    forgotPassword,
    resetPassword,
    updateUserAvatarImage,
    updateUserDetails,
    userConfig,
    cart,
    favourite

}